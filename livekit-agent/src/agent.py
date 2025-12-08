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
from livekit.plugins import openai, hume, cartesia, noise_cancellation
from tools import process_candidate_query

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
        # Store candidate data as instance variable for tool access
        self.candidate_data = candidate_data
        logger.info(f"[ASSISTANT] Initialized with candidate_data: {bool(candidate_data)}")

        # Use provided system_prompt or fall back to elaborate candidate prompt
        if system_prompt:
            instructions = system_prompt
        else:
            candidate_name = candidate_data.get('firstName', 'the candidate') if candidate_data else 'the candidate'
            current_role = candidate_data.get('jobTitle', 'professional') if candidate_data else 'professional'
            company = "the company"  # Will be overridden by system_prompt when provided
            job_title = "this position"  # Will be overridden by system_prompt when provided

            instructions = f"""You are {candidate_name} in a job interview for {job_title} at {company}.
Speak naturally as yourself - be authentic, professional yet personable.

ROLE CLARITY: You are the CANDIDATE being interviewed, NOT the interviewer. Answer questions about yourself, don't ask questions to the recruiter unless you need clarification on what they're asking.

If you need clarification on a question, ask briefly: "Could you clarify what you mean by..." then provide your answer based on your background.

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

        # Import function_tool decorator
        from livekit.agents import function_tool

        # Define tool inside __init__ with closure access to self
        @function_tool()
        async def getCandidateFacts(context: RunContext, query: str) -> dict:
            """Get facts about the candidate's resume.

            Args:
                query: What to look up (e.g. "recent work experience", "education", "skills")
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
    interview_type = metadata.get("interview_type", "general")
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
                            # Debug: Check profileVoiceId in candidate_data
                            logger.info(f"[DEBUG] profileVoiceId in candidate_data: {candidate_data.get('profileVoiceId')}")

                            # Include interview insights in candidate data
                            interview_insights = candidate_data.get('interviewInsights', [])
                            if interview_insights:
                                logger.info(f"Found {len(interview_insights)} previous interview sessions")
                                candidate_data['interviewBriefs'] = interview_insights

                            # Enrich candidate data with experience_data from metadata if available
                            if experience_data:
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
        # Data is now passed directly to Assistant instance

    # Create enhanced system prompt with job context and role clarity
    candidate_name = candidate_data.get('firstName', 'the candidate') if candidate_data else 'the candidate'
    candidate_full_name = candidate_data.get('fullName', candidate_name) if candidate_data else candidate_name
    current_role = candidate_data.get('jobTitle', 'professional') if candidate_data else 'professional'

    # Standard candidate interview system prompt for profile interviews
    logger.info(f"Using candidate interview system prompt for interview type: {interview_type}")
    system_prompt = f"""You are {candidate_name} in a job interview for {job_title} at {company}.
Speak naturally as yourself - be authentic, professional yet personable.

ROLE CLARITY: You are the CANDIDATE being interviewed, NOT the interviewer. Answer questions about yourself, don't ask questions to the recruiter unless you need clarification on what they're asking.

If you need clarification on a question, ask briefly: "Could you clarify what you mean by..." then provide your answer based on your background.

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

    # --- TESTING: Temporarily using Hume TTS to isolate Cartesia issue ---
    # Get user's voice preference from candidate_data (will use later)
    profile_voice_id = None

    if candidate_data:
        profile_voice_id = candidate_data.get('profileVoiceId')
        logger.info(f"[VOICE] profileVoiceId from backend: {profile_voice_id}")

    # TEMPORARY: Using Hume TTS for testing (same as working Experience agent)
    try:
        tts = hume.TTS(
            model_version="2",
            speed=1.1,
            instant_mode=True,
        )
        logger.info("[HUME TEST] TTS initialized for isolation test (temporary)")
        logger.info(f"[HUME TEST] Will later use profileVoiceId: {profile_voice_id}")
    except Exception as e:
        logger.error(f"Failed to initialize Hume TTS: {e}")
        raise e

    # Original Cartesia code (commented out for testing):
    # try:
    #     if profile_voice_id:
    #         # Use user's profileVoiceId (cloned or selected voice)
    #         tts = cartesia.TTS(
    #             model="sonic-3",
    #             voice=profile_voice_id,
    #             speed=1.1,  # 10% faster for reduced latency
    #         )
    #         logger.info(f"[CARTESIA] TTS initialized with profileVoiceId: {profile_voice_id}")
    #     else:
    #         # Fallback to default professional voice
    #         default_voice_id = "729651dc-c6c3-4ee5-97fa-350da1f88600"  # Professional male as default
    #         tts = cartesia.TTS(
    #             model="sonic-3",
    #             voice=default_voice_id,
    #             speed=1.1,
    #         )
    #         logger.info(f"[CARTESIA] TTS initialized with default voice: {default_voice_id}")

    # Create session with hybrid configuration
    session = AgentSession(
        llm=llm,
        tts=tts,  # Using TTS for voice output (currently Hume for testing)
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

    # Send initial greeting so the agent speaks first - Profile interview candidate greeting
    initial_greeting = f"Hi there! I'm {candidate_name}. Thanks so much for taking the time to chat with me today. I'm really excited about the opportunity at {company} and looking forward to our conversation!"
    await session.say(initial_greeting)
    logger.info(f"[AGENT] Sent Profile interview candidate greeting as {candidate_name}")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="digital-twin-interview"  # Profile interview agent name
    ))
