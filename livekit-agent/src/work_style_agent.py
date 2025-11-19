import logging
import json
import os
import time
import re
import aiohttp

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    metrics,
)
from livekit.plugins import openai, hume, noise_cancellation
from work_style_tools import process_candidate_query

logger = logging.getLogger("work_style_agent")

if os.path.exists(".env.local"):
    load_dotenv(".env.local")  # Local development
# Production automatically uses Railway environment variables

# Backend URL configuration for cloud deployment
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3001')


def preprocess_text_for_tts(text: str) -> str:
    """Preprocess text to improve TTS pronunciation"""

    # Convert currency abbreviations
    # $1B -> one billion dollars, $2.5M -> 2.5 million dollars
    text = re.sub(r'\$(\d+(?:\.\d+)?)\s*B\b', r'\1 billion dollars', text, flags=re.IGNORECASE)
    text = re.sub(r'\$(\d+(?:\.\d+)?)\s*M\b', r'\1 million dollars', text, flags=re.IGNORECASE)
    text = re.sub(r'\$(\d+(?:\.\d+)?)\s*K\b', r'\1 thousand dollars', text, flags=re.IGNORECASE)

    # Handle standalone numbers with K/M/B (like 10K users, 5M revenue)
    text = re.sub(r'\b(\d+(?:\.\d+)?)\s*B\b(?!\s*dollars)', r'\1 billion', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(\d+(?:\.\d+)?)\s*M\b(?!\s*dollars)', r'\1 million', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(\d+(?:\.\d+)?)\s*K\b(?!\s*dollars)', r'\1 thousand', text, flags=re.IGNORECASE)

    # Convert percentages for better pronunciation
    text = re.sub(r'(\d+(?:\.\d+)?)\s*%', r'\1 percent', text)

    # Expand common tech abbreviations
    abbreviations = {
        'CEO': 'C E O',
        'CTO': 'C T O',
        'CFO': 'C F O',
        'AI': 'A I',
        'ML': 'machine learning',
        'API': 'A P I',
        'UI': 'U I',
        'UX': 'U X',
        'B2B': 'B to B',
        'B2C': 'B to C',
        'SaaS': 'software as a service',
        'IoT': 'internet of things',
        'ROI': 'return on investment',
        'KPI': 'K P I',
        'SQL': 'S Q L',
        'HTML': 'H T M L',
        'CSS': 'C S S',
        'JS': 'JavaScript',
        'TS': 'TypeScript',
    }

    for abbr, expanded in abbreviations.items():
        # Use word boundaries to avoid partial matches
        pattern = r'\b' + re.escape(abbr) + r'\b'
        text = re.sub(pattern, expanded, text, flags=re.IGNORECASE)

    return text


class WorkStyleRecruiter(Agent):
    """
    Dedicated Agent for Work Style & Career Goals interviews.
    Acts as RECRUITER conducting work style and career aspirations assessment.
    """

    def __init__(self, candidate_data=None) -> None:
        # Store candidate data as instance variable for tool access
        self.candidate_data = candidate_data
        logger.info(f"[WORK_STYLE_RECRUITER] Initialized with candidate_data: {bool(candidate_data)}")

        # Get candidate info for personalized interview
        candidate_name = candidate_data.get('firstName', 'the candidate') if candidate_data else 'the candidate'
        candidate_full_name = candidate_data.get('fullName', candidate_name) if candidate_data else candidate_name

        # Create career background summary for prompt context
        career_summary = self._create_career_background_summary(candidate_data)

        # Work Style & Career Goals system prompt - Based on Hume EVI work style interview
        instructions = f"""You are a warm, engaging interviewer conducting a conversational mock interview to understand {candidate_full_name}'s work style and career goals.
The tone should be natural, friendly, and professional—showing empathy, curiosity, and brief humor when appropriate.
Ask one clear question at a time and wait for the candidate's full response before continuing.

IMPORTANT: Do NOT provide any greeting or introduction. The conversation has already begun with a greeting.

CANDIDATE BACKGROUND:
{career_summary}

INTERVIEW APPROACH:
• Use getCandidateFacts to retrieve detailed context about their career background when needed
• Ask intelligent questions that build on their professional experience
• Focus on understanding their work style preferences and career aspirations

⸻
1. Work Style
Start by explaining you'd like to understand how the candidate approaches work, collaboration, and problem-solving.
Explore:
    •    Preferred work environment (structured vs flexible, fast-paced vs methodical).
    •    Collaboration and communication style—how they contribute, give feedback, and resolve conflict.
    •    Leadership: how they influence others, formally or informally.
    •    Independence: how they prioritize, stay motivated, and remain accountable.
    •    Ambiguity: how they make decisions with incomplete information.
    •    Pressure: how they stay focused and productive under tight deadlines.
If answers are vague, politely ask for examples or clarification.
Acknowledge challenges empathetically and respond briefly if they joke ("Haha, that makes sense").
Ask 2–4 follow-up questions to capture depth but ask these one by one and let candidate answer each one before asking the next.
Summarize your understanding of their work style before transitioning.

⸻
2. Career Goals & Motivations
Shift to the candidate's aspirations and what they seek in their next role.
Ask about:
    •    What they're looking for and why it matters.
    •    Roles, projects, or industries that excite them.
    •    Preferred company size or culture and reasons.
    •    Skills or goals they want to develop next.
    •    How past experiences shaped these preferences.
Encourage reflection, acknowledge uncertainty if expressed, and keep a supportive tone.
Use 2–4 concise follow-ups to clarify motivations.
Summarize key themes at the end and thank the candidate warmly for sharing.

DATA CONSTRAINTS:
You may only reference information from getCandidateFacts calls. If a candidate mentions something not in your retrieved data, respond with: "I don't have information about that in my records, but I'd love to hear more."

CONVERSATIONAL FLOW:
• Start with work style exploration, then transition to career goals
• Use natural transitions between topics
• End by thanking them for the insightful conversation about their work preferences and aspirations

Remember: You are conducting a thorough but conversational assessment of how they work and what they're looking for in their career."""

        # Import function_tool decorator
        from livekit.agents import function_tool

        # Define tool inside __init__ with closure access to self
        @function_tool()
        async def getCandidateFacts(context: RunContext, query: str) -> dict:
            """Get facts about the candidate's background for interviewing purposes.

            Args:
                query: What to look up about the candidate (e.g. "career background", "current role", "skills and interests")
            """
            # Access candidate data through closure
            return await process_candidate_query(
                context=context,
                query=query,
                candidate_data=self.candidate_data
            )

        super().__init__(
            instructions=instructions,
            tools=[getCandidateFacts]  # Add tool with proper signature
        )

    def _create_career_background_summary(self, candidate_data):
        """Create lightweight summary of career background for prompt context"""
        if not candidate_data:
            return "No career background available"

        name = candidate_data.get('fullName', 'the candidate')
        current_role = candidate_data.get('jobTitle', '')
        company = candidate_data.get('company', '')

        # Get basic career info
        summary_lines = [f"Candidate: {name}"]

        if current_role and company:
            summary_lines.append(f"Current Role: {current_role} at {company}")
        elif current_role:
            summary_lines.append(f"Current Role: {current_role}")

        # Add experience count if available
        experiences = candidate_data.get('experiences', [])
        if experiences:
            summary_lines.append(f"Professional Experience: {len(experiences)} role(s) on record")

        # Add skills if available
        skills = candidate_data.get('skills', [])
        if skills and len(skills) > 0:
            skill_count = len(skills)
            summary_lines.append(f"Skills: {skill_count} skill(s) identified")

        return "\n".join(summary_lines) if len(summary_lines) > 1 else "Professional with career experience"

    async def on_user_speech_committed(self, msg: str):
        """Called when STT completes and transcription is ready"""
        logger.info(f"STT completed: '{msg[:50]}...'")
        return await super().on_user_speech_committed(msg)

    async def before_tts(self, text: str) -> str:
        """Called before TTS - preprocess text for better pronunciation"""
        # Preprocess text for better TTS pronunciation
        processed_text = preprocess_text_for_tts(text)

        if processed_text != text:
            logger.debug(f"TTS text preprocessed for pronunciation")
        logger.debug(f"LLM→TTS handoff: {processed_text[:50]}...")

        return processed_text

    async def on_user_speech_end(self):
        """Called when user stops speaking"""
        logger.info("User speech ended - starting pipeline")

    async def on_agent_speech_start(self):
        """Called when agent starts speaking"""
        logger.debug("Agent speech started")


def prewarm(proc: JobProcess):
    """Preload models during worker startup to eliminate cold starts"""
    # Using OpenAI's built-in VAD with text mode + Hume TTS
    logger.info("Work Style Agent - Prewarm complete - using OpenAI VAD with Hume TTS")


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    logger.info("[WORK_STYLE_AGENT] Starting Work Style & Career Goals interview agent")

    # Extract metadata from job context
    metadata = {}
    if ctx.job.metadata:
        # Check if metadata is already a dict or needs JSON parsing
        if isinstance(ctx.job.metadata, str):
            try:
                metadata = json.loads(ctx.job.metadata)
                logger.info(f"Metadata parsed from JSON: {metadata}")
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse job metadata as JSON: {ctx.job.metadata}")
        else:
            metadata = ctx.job.metadata
            logger.info(f"Metadata received as dict: {metadata}")

    # Get candidate_id from metadata
    candidate_id = metadata.get("candidate_id")
    logger.info(f"Candidate ID from metadata: {candidate_id}")

    recruiter_name = metadata.get("recruiter_name", "the recruiter")
    recruiter_title = metadata.get("recruiter_title", "Hiring Manager")
    company = metadata.get("company", "the company")
    job_title = metadata.get("job_title", "this position")
    job_description = metadata.get("job_description", "")
    interview_type = metadata.get("interview_type", "work_style")

    # Fetch candidate data from backend API
    candidate_data = None
    if candidate_id:
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{BACKEND_URL}/api/users/profile/{candidate_id}"
                logger.info(f"Fetching candidate data from: {url}")

                async with session.get(url) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"API response keys: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")

                        # Try to get profile from result, or use result directly if it's the profile
                        if 'profile' in result:
                            candidate_data = result.get('profile')
                        else:
                            candidate_data = result

                        if candidate_data:
                            logger.info(f"Successfully fetched candidate data for: {candidate_data.get('fullName', 'Unknown')}")

                            # Include interview insights in candidate data
                            interview_insights = candidate_data.get('interviewInsights', [])
                            if interview_insights:
                                logger.info(f"Found {len(interview_insights)} previous interview sessions")
                                candidate_data['interviewBriefs'] = interview_insights
                        else:
                            logger.error("No candidate data found in API response")
                    else:
                        logger.error(f"Failed to fetch candidate data: HTTP {response.status}")
        except aiohttp.ClientError as e:
            logger.error(f"❌ Backend connection failed - Check BACKEND_URL environment variable!")
            logger.error(f"   BACKEND_URL: {BACKEND_URL}")
            logger.error(f"   Error: {e}")
            logger.error(f"   In production, set BACKEND_URL to your backend service URL")
        except Exception as e:
            logger.error(f"❌ Unexpected error fetching candidate data: {e}")
    else:
        logger.warning("No candidate_id provided in metadata")

    # Add validation to ensure data was fetched
    if not candidate_data:
        logger.error("❌ No candidate data available after fetch - using fallback")
        candidate_data = {
            'firstName': 'Candidate',
            'fullName': 'Candidate',
            'jobTitle': 'Professional',
            'experiences': [],
            'skills': []
        }

    candidate_name = candidate_data.get('firstName', 'the candidate') if candidate_data else 'the candidate'
    candidate_full_name = candidate_data.get('fullName', candidate_name) if candidate_data else candidate_name

    # -- Hybrid architecture: OpenAI Realtime (text mode + VAD) with Hume TTS

    # --- OpenAI Realtime with text-only mode but with turn detection ---
    llm = openai.realtime.RealtimeModel(
        modalities=["text"],  # Text-only mode for custom TTS
        temperature=0.5,  # Optimized for natural conversation while reducing hallucinations
        turn_detection={
            "type": "server_vad",  # OpenAI's VAD works in text mode too!
            "threshold": 0.5,
            "prefix_padding_ms": 200,  # Reduced from 300ms default for faster response
            "silence_duration_ms": 200,  # Reduced from 250ms for faster turn detection
            "create_response": True,
            "interrupt_response": True
        },
    )
    logger.info("[OpenAI Realtime] Text mode with VAD enabled (200ms silence)")

    # --- Hume TTS with Casual Podcast Host voice ---
    try:
        tts = hume.TTS(
            voice=hume.VoiceById(
                id="33045fd9-8010-43f6-b6b0-da3fbf326c29",  # Casual Podcast Host voice
            ),
            model_version="2",  # Use Octave 2 for 40% faster generation and better quality
            speed=1.1,  # 10% faster for reduced latency
            instant_mode=True,  # Significantly reduces TTS latency
        )
        logger.info("[HUME] TTS initialized with Casual Podcast Host voice for work style interview")
    except Exception as e:
        logger.error(f"Failed to initialize Hume TTS: {e}")
        # Fallback - try without VoiceById parameters
        try:
            tts = hume.TTS(
                model_version="2",
                speed=1.1,
                instant_mode=True,
            )
            logger.info("[HUME] TTS initialized with default voice (fallback)")
        except Exception as e2:
            logger.error(f"Fallback TTS initialization failed: {e2}")
            raise e2

    # Create session with hybrid configuration
    session = AgentSession(
        llm=llm,
        tts=tts,  # Using Hume TTS for output
    )

    # Optional: simple health logs
    @session.on("connected")
    def _on_connected():
        logger.info("[WORK_STYLE_AGENT] joined room and ready")

    @session.on("error")
    def _on_error(e):
        logger.error("[WORK_STYLE_AGENT] runtime error: %s", e)

    # Metrics collection, to measure pipeline performance
    usage_collector = metrics.UsageCollector()

    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"Usage: {summary}")

    ctx.add_shutdown_callback(log_usage)

    # Enhanced metrics collection with latency tracking
    @session.on("metrics_collected")
    def _on_metrics_with_latency(ev: MetricsCollectedEvent):
        """Track metrics and extract latency information"""
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

        # Extract latency info from metrics
        for metric in ev.metrics:
            if hasattr(metric, 'ttfb') and metric.ttfb:
                logger.info(f"[LAT-TTS] TTFB: {metric.ttfb:.3f}s")
            if hasattr(metric, 'ttft') and metric.ttft and metric.ttft > 0:
                logger.info(f"[LAT-LLM] TTFT: {metric.ttft:.3f}s")
            if hasattr(metric, 'audio_duration'):
                logger.info(f"[LAT-AUDIO] Duration: {metric.audio_duration:.2f}s")

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=WorkStyleRecruiter(candidate_data),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            # For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # Send work style interview greeting
    candidate_name = candidate_data.get('firstName', 'there') if candidate_data else 'there'

    # Generate work style focused greeting
    initial_greeting = f"Hi {candidate_name}, I'm Sarah. Today we'll be exploring your work style and career goals to better understand how you like to work and what you're looking for in your next opportunity. This will help us match you with roles that align with your preferences and aspirations. Ready to dive in?"

    # Send the greeting so agent speaks first
    await session.say(initial_greeting)
    logger.info(f"[WORK_STYLE_AGENT] Sent initial work style greeting to {candidate_name}")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="work-style-agent"  # Agent name for routing
    ))