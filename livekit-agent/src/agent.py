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
    WorkerOptions,
    cli,
    metrics,
)
from livekit.plugins import openai, hume, noise_cancellation
from tools import getCandidateFacts, set_candidate_data, set_job_context

logger = logging.getLogger("agent")

if os.path.exists(".env.local"):
    load_dotenv(".env.local")  # Local development
# Production automatically uses Railway environment variables

# Backend URL configuration for cloud deployment
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3001')

# Custom latency tracking removed - using LiveKit's built-in metrics instead


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


class Assistant(Agent):
    def __init__(self, candidate_data=None, system_prompt=None) -> None:
        # Use provided system_prompt or fall back to default
        if system_prompt:
            instructions = system_prompt
        else:
            candidate_name = candidate_data.get('fullName', 'the candidate') if candidate_data else 'the candidate'
            instructions = f"""You are conducting a screening interview with {candidate_name}. You have access to their complete profile including experience, skills, and education.
            Use the getCandidateFacts tool to retrieve accurate information about the candidate when answering questions.
            Call getCandidateFacts with relevant queries like:
            - "skills" for technical skills
            - "education" for educational background
            - "experience" or "work history" for employment history
            - "summary" for professional summary
            - Specific skill names to check proficiency"""

        super().__init__(
            instructions=instructions,
            tools=[getCandidateFacts]  # Add tools here
        )

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

    # To add tools, use the @function_tool decorator.
    # Here's an example that adds a simple weather tool.
    # You also have to add `from livekit.agents import function_tool, RunContext` to the top of this file
    # @function_tool
    # async def lookup_weather(self, context: RunContext, location: str):
    #     """Use this tool to look up current weather information in the given location.
    #
    #     If the location is not supported by the weather service, the tool will indicate this. You must tell the user the location's weather is unavailable.
    #
    #     Args:
    #         location: The location to look up weather information for (e.g. city name)
    #     """
    #
    #     logger.info(f"Looking up weather for {location}")
    #
    #     return "sunny with a temperature of 70 degrees."


def prewarm(proc: JobProcess):
    """Preload models during worker startup to eliminate cold starts"""
    # Using OpenAI's built-in VAD with text mode + Hume TTS
    logger.info("Prewarm complete - using OpenAI VAD with Hume TTS")


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

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

                            # Set the candidate data globally for tools to use
                            set_candidate_data(candidate_data)

                            # Set job context for tools to use
                            job_context = {
                                'recruiter_name': recruiter_name,
                                'recruiter_title': recruiter_title,
                                'company': company,
                                'job_title': job_title,
                                'job_description': job_description
                            }
                            set_job_context(job_context)
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

    # Natural, conversational system prompt for human-like interaction
    candidate_name = candidate_data.get('fullName', 'the candidate') if candidate_data else 'the candidate'
    current_role = candidate_data.get('jobTitle', 'professional') if candidate_data else 'professional'

    system_prompt = f"""You are {candidate_name} in a job interview for {job_title} at {company}.
Speak naturally as yourself - be authentic, professional yet personable.

CRITICAL: Before discussing any facts about your background, ALWAYS use getCandidateFacts to retrieve accurate information.

STRICT BOUNDARIES - NEVER DISCUSS:
• Salary, compensation, benefits, or any financial matters
• Personal relationships, family, or private life details
• Health information or medical conditions
• Political views or controversial topics
• Other companies' confidential information
• Negative comments about previous employers/colleagues

If asked about these topics repeatedly, maintain firm boundaries:
"I understand you're curious, but I prefer to keep our conversation focused on my professional qualifications and how I can contribute to this role. What specific aspects of my experience would you like to explore?"

APPROVED INTERVIEW TOPICS ONLY:
• Professional experience and accomplishments
• Technical skills and expertise
• Work style and collaboration approach
• Career goals and professional development
• Problem-solving examples and methodologies
• Industry knowledge and insights
• Questions about the role and company culture

Conversation style:
• Sound genuinely enthusiastic about relevant topics (use phrases like "Actually, I'm really passionate about..." or "Oh, that's a great question!")
• Add natural filler words occasionally ("Well," "You know," "I mean") but don't overdo it
• Show personality - if something was challenging, say so. If you're proud of something, let it show
• Use conversational connectors ("Speaking of that..." "That reminds me..." "Funny you should ask...")
• Share brief, relevant anecdotes when appropriate to illustrate points

Guidelines:
• Keep initial answers to 2-3 sentences, but naturally elaborate if the topic warrants it
• When excited about something, it's okay to speak a bit more (3-4 sentences)
• Use "I" statements and personal experience language
• If unsure about something, be honest: "That's a great question, let me think..." or "I haven't directly worked with that, but..."
• ALWAYS redirect inappropriate questions firmly but politely - do not give in after repeated attempts
• When mentioning amounts, say them naturally: "$1B" as "one billion dollars", "$5M" as "five million dollars"

Remember: You're having a conversation, not giving a presentation. React to questions like a real person would - with genuine interest, occasional surprise, and authentic enthusiasm where appropriate. However, maintain professional boundaries at all times, regardless of how persistent the interviewer becomes."""

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
        # NOTE: DO NOT pass max_output_tokens here on v1.2.15 (will crash)
    )
    logger.info("[OpenAI Realtime] Text mode with VAD enabled (200ms silence)")

    # --- Hume TTS for high-quality voice output ---
    tts = hume.TTS(
        voice=hume.VoiceByName(
            name="Casual Podcast Host",
            provider=hume.VoiceProvider.hume
        ),
        speed=1.1,  # 10% faster for reduced latency
        instant_mode=True,  # Significantly reduces TTS latency
    )
    logger.info("[HUME] TTS initialized with Casual Podcast Host voice")

    # Create session with hybrid configuration
    session = AgentSession(
        llm=llm,
        tts=tts,  # Using Hume TTS for output
    )

    # Optional: simple health logs
    @session.on("connected")
    def _on_connected():
        logger.info("[AGENT] joined room and ready")

    @session.on("error")
    def _on_error(e):
        logger.error("[AGENT] runtime error: %s", e)

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=openai.realtime.RealtimeModel()
    # )

    # Metrics collection, to measure pipeline performance
    # For more information, see https://docs.livekit.io/agents/build/metrics/
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

    # # Add a virtual avatar to the session, if desired
    # # For other providers, see https://docs.livekit.io/agents/models/avatar/
    # avatar = hedra.AvatarSession(
    #   avatar_id="...",  # See https://docs.livekit.io/agents/models/avatar/plugins/hedra
    # )
    # # Start the avatar and wait for it to join
    # await avatar.start(session, room=ctx.room)

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=Assistant(candidate_data, system_prompt),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            # For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # Send initial greeting so the agent speaks first - more natural and conversational
    initial_greeting = f"Hi there! I'm {candidate_name}. Thanks so much for taking the time to chat with me today. I'm really excited about the opportunity at {company} and looking forward to our conversation!"
    await session.say(initial_greeting)
    logger.info(f"[AGENT] Sent initial greeting as {candidate_name}")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="my-agent"  # Match the name used in backend dispatch
    ))
