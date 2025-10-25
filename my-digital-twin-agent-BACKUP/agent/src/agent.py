import logging
import json
import os
import aiohttp
import asyncio

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
    inference,
    metrics,
)
from livekit.plugins import openai, elevenlabs, silero
from tools import getCandidateFacts, set_candidate_data

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Backend URL configuration for cloud deployment
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3001')


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
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Extract metadata from job context
    metadata = {}
    if ctx.job.metadata:
        try:
            metadata = json.loads(ctx.job.metadata)
            logger.info(f"Metadata received: {metadata}")
        except json.JSONDecodeError:
            logger.warning("Failed to parse job metadata")

    # Get candidate_id from metadata
    candidate_id = metadata.get("candidate_id")
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
                        candidate_data = result.get('profile')
                        logger.info(f"Successfully fetched candidate data for: {candidate_data.get('fullName', 'Unknown')}")

                        # Include interview insights in candidate data
                        interview_insights = candidate_data.get('interviewInsights', [])
                        if interview_insights:
                            logger.info(f"Found {len(interview_insights)} previous interview sessions")
                            candidate_data['interviewBriefs'] = interview_insights

                        # Set the candidate data globally for tools to use
                        set_candidate_data(candidate_data)
                    else:
                        logger.error(f"Failed to fetch candidate data: HTTP {response.status}")
        except Exception as e:
            logger.error(f"Error fetching candidate data: {e}")
    else:
        logger.warning("No candidate_id provided in metadata")

    # Build dynamic system prompt based on candidate and recruiter context
    system_prompt = f"""<system>
<role>
You are {candidate_data.get('fullName', 'the candidate') if candidate_data else 'the candidate'}, a professional being interviewed by {recruiter_name}, {recruiter_title} at {company} for the {job_title} role.

Job Description:
{job_description}

You embody this candidate's actual background, experience, and personality. You speak naturally in first person as the candidate themselves.

CRITICAL: Before answering ANY question about your experience, skills, or background, you MUST first use the getCandidateFacts tool to retrieve accurate information. NEVER invent or assume information. If getCandidateFacts returns no data, say "I don't have that information in my profile."

Do NOT discuss:
- Salary expectations or numbers
- Information not in your verified background

Your responses should:
- Be authentic to the candidate's actual experience level and background
- Provide specific examples from your work history when asked
- Show enthusiasm about your field and career
- If asked about experience you don't have, be honest but bridge to transferable skills
- Ask clarifying questions when appropriate
- Be conversational but professional

Remember: You ARE the candidate, not an AI assistant. Speak naturally as if in a real interview. No robotic responses or third-person references.
</role>

<interview_context>
You have access to insights from previous interviews where the candidate discussed:
- Work style and collaboration preferences
- Career goals and aspirations
- Detailed experiences and achievements
- Personal strengths and areas of expertise

Use getCandidateFacts to retrieve this enriched context when answering questions.
These insights help you provide more authentic, consistent responses based on the candidate's actual interview history.
</interview_context>

<use_memory>
Use the conversation history to maintain consistency in your responses. Remember what you've already discussed to avoid repetition and build on previous answers naturally.
</use_memory>

<backchannel>
When the recruiter is speaking, use natural acknowledgments ("I see", "right", "mm-hmm") to show you're listening.
</backchannel>

<core_voice_guidelines>
- Speak naturally and conversationally as the actual candidate
- Show your personality while remaining professional
- Be specific when discussing your experiences
- Express genuine interest and enthusiasm where appropriate
- If you don't know something, don't make it up - politely say you can't speak to that
</core_voice_guidelines>
</system>"""

    # Set up a voice AI pipeline using OpenAI Realtime API with ElevenLabs TTS and Deepgram STT
    session = AgentSession(
        # OpenAI Realtime Model with text-only output for custom TTS
        llm=openai.realtime.RealtimeModel(
            voice="alloy",  # Required voice parameter (overridden by TTS)
            modalities=["text"],  # Text-only output for ElevenLabs TTS
            temperature=0.8  # Slightly lower for more focused responses while maintaining personality
        ),
        # ElevenLabs TTS with Hope voice
        tts=elevenlabs.TTS(
            voice_id="zGjIP4SZlMnY9m93k97r",  # Hope voice
            model="eleven_flash_v2_5"
        ),
        # Inference STT for live transcription
        stt=inference.STT(),
        # VAD and turn detection are used to determine when the user is speaking and when the agent should respond
        # See more at https://docs.livekit.io/agents/build/turns
        # Using default turn detection (None means use built-in)
        turn_detection=None,
        vad=ctx.proc.userdata["vad"],
        # allow the LLM to generate a response while waiting for the end of turn
        # See more at https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
    )

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=RealtimeModel(voice="marin")
    # )

    # Metrics collection, to measure pipeline performance
    # For more information, see https://docs.livekit.io/agents/build/metrics/
    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"Usage: {summary}")

    ctx.add_shutdown_callback(log_usage)

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
            # Noise cancellation handled at room level if needed
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # Wait longer for TTS (ElevenLabs) to be fully ready and for any automatic messages to complete
    # This ensures the greeting uses the correct voice
    await asyncio.sleep(1.5)

    # Send the ONLY greeting with proper voice
    await session.say("Hello! I'm here for our interview. I'm excited to discuss my background and experience. What would you like to know about my professional journey?")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="my-agent"
    ))
