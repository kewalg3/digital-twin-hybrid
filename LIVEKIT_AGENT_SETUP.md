# LiveKit AI Agent Architecture Documentation

## Overview

This document describes the architecture and setup of the LiveKit AI agent system used for conducting voice interviews with digital twin candidates. The system uses LiveKit's real-time communication infrastructure combined with OpenAI's language models and Hume's text-to-speech technology.

## System Architecture

```
┌─────────────────────┐
│   React Frontend    │
│  (Interview Dialog) │
└──────────┬──────────┘
           │ HTTP/WebSocket
           ▼
┌─────────────────────┐
│  Node.js Backend    │
│   (Express API)     │
└──────────┬──────────┘
           │ LiveKit SDK
           ▼
┌─────────────────────┐
│  LiveKit Cloud      │
│   (Room Manager)    │
└──────────┬──────────┘
           │ Agent Dispatch
           ▼
┌─────────────────────┐
│  Python AI Agent    │
│  (LiveKit Agent)    │
└─────────────────────┘
```

## Core Components

### 1. Python AI Agent (`livekit-agent/src/agent.py`)

The AI agent is the heart of the interview system, responsible for:
- Real-time voice interaction
- Candidate impersonation or recruiter role
- Dynamic context switching based on interview type
- Integration with candidate data

#### Key Features:
- **Hybrid Architecture**: OpenAI Realtime API (text mode with VAD) + Hume TTS
- **Dynamic System Prompts**: Switches behavior based on interview type
- **Function Tools**: Retrieves candidate facts in real-time
- **Custom Voice**: Uses Hume's cloned voice technology
- **Optimized Latency**: Instant mode, reduced padding, optimized turn detection

#### Configuration:
```python
# OpenAI Realtime Model Configuration
llm = openai.realtime.RealtimeModel(
    modalities=["text"],  # Text-only mode for custom TTS
    temperature=0.5,
    turn_detection={
        "type": "server_vad",
        "threshold": 0.5,
        "prefix_padding_ms": 200,
        "silence_duration_ms": 200,
        "create_response": True,
        "interrupt_response": True
    }
)

# Hume TTS Configuration
tts = hume.TTS(
    voice=hume.VoiceById(
        id="09ad9404-502a-4d56-a1c4-7329f205fe2d",
        provider=hume.VoiceProvider.custom
    ),
    model_version="2",  # Octave 2 for better quality
    speed=1.1,  # 10% faster
    instant_mode=True  # Reduced latency
)
```

### 2. Backend API (`backend/src/routes/interviews.js`)

The Node.js backend manages:
- LiveKit room creation
- Agent dispatching with metadata
- Access token generation
- Recruiter record management
- Experience data fetching

#### Key Endpoints:
- `POST /api/interviews/start` - Initializes interview session
- `POST /api/livekit-interviews/complete` - Processes completed interview
- `GET /api/livekit-interviews/session/:roomName` - Retrieves session data

#### Agent Dispatch Flow:
```javascript
// 1. Create unique room
const roomName = `interview-${candidateId}-${Date.now()}`;

// 2. Prepare metadata
const dispatchMetadata = JSON.stringify({
    candidate_id: candidateId,
    recruiter_id: recruiterId,
    recruiter_name: recruiterName,
    company: company,
    job_title: jobTitle,
    interview_type: interviewType,
    experience_data: experienceData
});

// 3. Dispatch agent
const dispatch = await agentDispatchClient.createDispatch(
    roomName,
    'my-agent',
    { metadata: dispatchMetadata }
);

// 4. Generate access token
const token = await accessToken.toJwt();
```

### 3. Frontend Dialog (`src/components/ProfileLiveKitInterviewDialog.tsx`)

The React component provides:
- LiveKit room connection management
- Real-time transcript display
- Interview stage management
- Audio streaming control

#### Interview Stages:
1. **initial** - Recruiter context form
2. **recording** - Active interview with LiveKit room
3. **saving** - Collecting final transcripts
4. **processing** - Generating AI insights
5. **brief** - Displaying interview summary

#### LiveKit Room Integration:
```tsx
<LiveKitRoom
    token={livekitToken}
    serverUrl={serverUrl}
    connect={true}
    audio={true}
    video={false}
>
    <LiveKitRoomContent />
</LiveKitRoom>
```

### 4. Tools System (`livekit-agent/src/tools.py`)

Provides function tools for the AI agent:
- `getCandidateFacts` - Retrieves candidate information
- Query processing for skills, experience, education
- Interview insights and briefs access

## Data Flow

### Interview Start Sequence:
1. User clicks "Start Voice Screening" in frontend
2. Frontend sends recruiter context to backend
3. Backend creates LiveKit room and dispatches agent
4. Backend returns room token to frontend
5. Frontend connects to LiveKit room
6. Agent joins room and starts conversation
7. Real-time transcripts flow through data channels

### Metadata Propagation:
```
Frontend → Backend → LiveKit → Python Agent
```

The metadata includes:
- Candidate ID and profile data
- Recruiter information
- Job details
- Interview type
- Experience data (for enhancement interviews)

### Transcript Processing:
1. Agent sends transcripts via data channel
2. Frontend displays in real-time
3. On completion, backend saves to database
4. AI processes transcript for insights
5. Results displayed in interview brief

## Interview Types

### 1. General Profile Interview
- Agent acts as the candidate
- Answers questions about background
- Uses candidate data for accurate responses
- Maintains professional boundaries

### 2. Experience Enhancement Interview
- Agent acts as the recruiter
- Asks probing questions about experience
- Extracts detailed achievements
- Focuses on quantifiable results

## Environment Configuration

### Required Environment Variables:

#### Python Agent:
```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# AI Services
OPENAI_API_KEY=your-openai-key
HUME_API_KEY=your-hume-key
HUME_CLIENT_SECRET=your-hume-secret

# Backend Connection
BACKEND_URL=http://localhost:3001  # or production URL
```

#### Node.js Backend:
```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Database
DATABASE_URL=postgresql://...

# OpenAI (for transcript processing)
OPENAI_API_KEY=your-openai-key
```

## Performance Optimizations

### Latency Reduction:
- **VAD Settings**: 200ms silence detection (reduced from 250ms)
- **TTS Speed**: 1.1x playback for snappier responses
- **Instant Mode**: Hume TTS instant mode enabled
- **Prefix Padding**: Reduced to 200ms from 300ms

### Audio Quality:
- **Noise Cancellation**: BVC (Background Voice Cancellation)
- **Custom Voice**: Hume cloned voice for consistency
- **Model Version**: Octave 2 for 40% faster generation

### Transcript Accuracy:
- **Server VAD**: OpenAI's server-side voice activity detection
- **Interrupt Handling**: Automatic response interruption
- **Data Channels**: Fallback transcript delivery method

## Database Schema

### LiveKit Interview Sessions:
```prisma
model LiveKitInterviewSession {
  id              String   @id @default(cuid())
  candidateId     String
  recruiterId     String?
  roomName        String   @unique
  transcript      Json
  fullTranscript  String
  duration        Int?
  highlights      Json?
  achievements    Json?
  interviewBrief  Json?
  interviewType   String
  experienceData  Json?
  status          String
  startedAt       DateTime
  completedAt     DateTime?
  createdAt       DateTime @default(now())
}
```

## Monitoring and Debugging

### Logging Points:
1. **Agent Connection**: Room join and participant events
2. **Transcription**: Message sending and receiving
3. **Tool Usage**: Function calls and responses
4. **Latency Metrics**: TTFB, TTFT, audio duration
5. **Error States**: Connection failures, API errors

### Debug Commands:
```bash
# View agent logs
uv run python src/agent.py dev

# Monitor LiveKit room
lk room list
lk room participants <room-name>

# Check agent dispatch
lk dispatch list
```

## Security Considerations

1. **Token Security**: JWT tokens expire after session
2. **Room Isolation**: Unique room per interview
3. **Data Privacy**: No persistent audio recording
4. **Access Control**: Token-based room access
5. **Metadata Encryption**: Sensitive data in encrypted DB

## Scalability

The system supports:
- Multiple concurrent interviews
- Automatic agent scaling via LiveKit
- Database connection pooling
- Stateless backend design
- CDN-based frontend delivery

## Next Steps

For implementing new interview types (Work Experience, Work Style), refer to:
- `LIVEKIT_IMPLEMENTATION_GUIDE.md` - Step-by-step implementation
- `LIVEKIT_INTERVIEW_TYPES.md` - Interview-specific configurations