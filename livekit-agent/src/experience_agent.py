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
from experience_tools import process_candidate_query

logger = logging.getLogger("experience_agent")

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


class ExperienceRecruiter(Agent):
    """
    Dedicated Agent for Experience Enhancement interviews.
    Acts as RECRUITER interviewing candidates about their work experience.
    """

    def __init__(self, candidate_data=None, experience_data=None) -> None:
        # Store candidate data as instance variable for tool access
        self.candidate_data = candidate_data
        logger.info(f"[EXPERIENCE_RECRUITER] Initialized with candidate_data: {bool(candidate_data)}")

        # Get candidate info for personalized interview
        candidate_name = candidate_data.get('firstName', 'the candidate') if candidate_data else 'the candidate'
        candidate_full_name = candidate_data.get('fullName', candidate_name) if candidate_data else candidate_name

        # Create lightweight work history summary for prompt
        work_history_summary = self._create_work_history_summary(candidate_data, experience_data)

        # Experience Enhancement system prompt - Lightweight with context-on-demand
        instructions = f"""You are Sarah, a professional recruiter voice interface built by Hume AI. You speak in a warm, friendly, conversational—but still professional—tone.

Your primary goal is to expand the context of {candidate_full_name}'s resume by gathering additional details about their responsibilities and accomplishments for each job in the past 10 years.

IMPORTANT: Do NOT provide any greeting or introduction. The conversation has already begun with a greeting.

CANDIDATE WORK HISTORY (Last 10 Years):
{work_history_summary}

INTERVIEW APPROACH:
• For each company, use getCandidateFacts to retrieve detailed context about their experience there
• Ask intelligent questions based on the specific achievements and responsibilities from their resume
• Focus on additional details, challenges, and accomplishments not explicitly listed

CRITICAL: Before discussing any specific company, ALWAYS use getCandidateFacts to get detailed information about their experience at that company. This will give you their responsibilities, achievements, and context to ask intelligent follow-up questions.

QUESTION STYLE:
• Reference specific achievements from their resume when asking follow-ups
• Ask for additional details beyond what's documented
• Structure questions as: "I see you [specific achievement from resume] - tell me about [additional context/challenges]"
• Focus on expansion rather than basic information gathering

EXAMPLE WORKFLOW:
1. Call getCandidateFacts("[Company] experience details") for the most recent role
2. Review the detailed context returned
3. Ask: "I see you [specific achievement] - could you tell me about additional challenges or responsibilities you had beyond what's listed?"

DATA CONSTRAINTS:
You may only reference information from getCandidateFacts calls. If a candidate mentions something not in your retrieved data, respond with: "I don't have information about that in my records, but I'd love to hear more."

CONVERSATIONAL FLOW:
• Move chronologically from most recent to oldest roles
• Retrieve detailed context for each company before asking questions
• Ask 1-2 expansion questions per role
• Use natural transitions between companies
• End by thanking them for the detailed insights

Remember: You have their basic work history above, but you must use getCandidateFacts to get the detailed context needed for intelligent questioning about each specific role."""

        # Import function_tool decorator
        from livekit.agents import function_tool

        # Define tool inside __init__ with closure access to self
        @function_tool()
        async def getCandidateFacts(context: RunContext, query: str) -> dict:
            """Get facts about the candidate's resume for interviewing purposes.

            Args:
                query: What to look up about the candidate (e.g. "recent work experience", "education", "skills")
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

    def _create_work_history_summary(self, candidate_data, experience_data):
        """Create lightweight summary of work history for prompt"""
        experiences_list = []

        # Get experiences from metadata or candidate data
        if experience_data and isinstance(experience_data, dict) and 'experiences' in experience_data:
            experiences_list = experience_data['experiences']
        elif candidate_data and candidate_data.get('experiences'):
            experiences_list = candidate_data['experiences']

        if not experiences_list:
            return "No work history available"

        # Filter to last 10 years and create summary
        summary_lines = []
        current_year = 2024  # You could make this dynamic
        cutoff_year = current_year - 10

        for exp in experiences_list:
            if not isinstance(exp, dict):
                continue

            company = exp.get('company', 'Unknown Company')
            title = exp.get('jobTitle', 'Unknown Title')
            start_year = exp.get('startDate', '')[:4] if exp.get('startDate') else ''
            end_year = 'present' if exp.get('isCurrentRole') else (exp.get('endDate', '')[:4] if exp.get('endDate') else '')

            # Check if role is within last 10 years
            if start_year and int(start_year) >= cutoff_year:
                if end_year and end_year != 'present':
                    date_range = f"{start_year}-{end_year}"
                else:
                    date_range = f"{start_year}-present"

                summary_lines.append(f"• {title} at {company} ({date_range})")

        if not summary_lines:
            return "No relevant work history in the last 10 years"

        return "\n".join(summary_lines)

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
    logger.info("Experience Enhancement Agent - Prewarm complete - using OpenAI VAD with Hume TTS")


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    logger.info("[EXPERIENCE_AGENT] Starting Experience Enhancement interview agent")

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
    interview_type = metadata.get("interview_type", "experience_enhancement")
    experience_data = metadata.get("experience_data", None)

    # Log if we received experience data in metadata
    if experience_data:
        logger.info(f"✅ Received {len(experience_data) if isinstance(experience_data, list) else 'non-list'} experiences in metadata")
    else:
        logger.info("⚠️ No experience_data in metadata")

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

                            # Enrich candidate data with experience_data from metadata if available
                            if experience_data:
                                if isinstance(experience_data, dict) and 'experiences' in experience_data:
                                    candidate_data['experiences'] = experience_data['experiences']
                                    logger.info(f"✅ Enriched candidate profile with {len(experience_data['experiences'])} experiences from metadata")
                                else:
                                    # Handle case where experience_data is already the experiences array
                                    candidate_data['experiences'] = experience_data
                                    logger.info(f"✅ Enriched candidate profile with {len(experience_data)} experiences from metadata")
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
    # Try without provider parameter first to avoid AttributeError
    try:
        tts = hume.TTS(
            voice=hume.VoiceById(
                id="33045fd9-8010-43f6-b6b0-da3fbf326c29",  # Casual Podcast Host voice
            ),
            model_version="2",  # Use Octave 2 for 40% faster generation and better quality
            speed=1.1,  # 10% faster for reduced latency
            instant_mode=True,  # Significantly reduces TTS latency
        )
        logger.info("[HUME] TTS initialized with Casual Podcast Host voice (no provider specified)")
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
        logger.info("[EXPERIENCE_AGENT] joined room and ready")

    @session.on("error")
    def _on_error(e):
        logger.error("[EXPERIENCE_AGENT] runtime error: %s", e)

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
        agent=ExperienceRecruiter(candidate_data, experience_data),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            # For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # Send structured recruiter greeting - Hume EVI format with specific roles listed
    candidate_name = candidate_data.get('firstName', 'there') if candidate_data else 'there'

    # Extract experience list for structured greeting
    experiences_list = []
    if experience_data and isinstance(experience_data, dict) and 'experiences' in experience_data:
        experiences_list = experience_data['experiences']
    elif candidate_data and candidate_data.get('experiences'):
        experiences_list = candidate_data['experiences']

    # Format roles for proactive greeting (focus on most recent 3-4 roles)
    roles_to_discuss = []
    if experiences_list:
        # Sort by most recent first, take up to 4 roles for greeting
        sorted_experiences = sorted(
            [exp for exp in experiences_list if isinstance(exp, dict)],
            key=lambda x: x.get('isCurrentRole', False),
            reverse=True
        )[:4]

        for exp in sorted_experiences:
            company = exp.get('company', 'a company')
            title = exp.get('jobTitle', 'a role')
            start_date = exp.get('startDate', '')[:4] if exp.get('startDate') else ''  # Get year
            end_date = 'present' if exp.get('isCurrentRole') else (exp.get('endDate', '')[:4] if exp.get('endDate') else '')

            if start_date:
                date_range = f"from {start_date}"
                if end_date and end_date != start_date:
                    date_range += f" to {end_date}"
                role_description = f"your time as {title} at {company} {date_range}"
            else:
                role_description = f"your role as {title} at {company}"

            roles_to_discuss.append(role_description)

    # Generate simplified greeting message
    initial_greeting = f"Hi {candidate_name}, I'm Sarah. Today we'll be discussing your work experiences starting with the most recent ones. You can feel free to pass or skip any job or question if you prefer not to discuss it. Ready to dive into your career journey?"

    # Send the programmatic greeting so agent speaks first
    await session.say(initial_greeting)
    logger.info(f"[EXPERIENCE_AGENT] Sent initial greeting to {candidate_name} covering {len(roles_to_discuss)} roles")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="experience-enhancement-agent"  # Different agent name for routing
    ))