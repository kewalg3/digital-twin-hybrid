# LiveKit Agent Implementation Guide

## Step-by-Step Guide for Creating New Interview Types

This guide provides detailed instructions for implementing new LiveKit AI agent interview types, using the profile interview as a reference.

## Prerequisites

### 1. Environment Setup
```bash
# Python agent environment
cd livekit-agent
uv sync

# Node.js backend
cd backend
npm install

# Frontend
cd ..
npm install
```

### 2. Required API Keys
- LiveKit Cloud account and API keys
- OpenAI API key
- Hume AI API key (for custom TTS)
- PostgreSQL database

## Implementation Steps

## Step 1: Define Interview Type Configuration

### 1.1 Add Interview Type Constant
```typescript
// src/types/interview.types.ts
export enum InterviewType {
  GENERAL = 'general',
  EXPERIENCE_ENHANCEMENT = 'experience_enhancement',
  WORK_STYLE = 'work_style',  // New type
  CAREER_GOALS = 'career_goals'  // New type
}
```

### 1.2 Update Backend to Handle New Type
```javascript
// backend/src/routes/interviews.js
// The interview type will be passed in the request body
const { interviewType, experienceData } = req.body;

// Include in metadata for agent
const dispatchMetadata = JSON.stringify({
  // ... other fields
  interview_type: interviewType,
  experience_data: experienceData
});
```

## Step 2: Configure AI Agent System Prompt

### 2.1 Create System Prompt in Python Agent
```python
# livekit-agent/src/agent.py

# Add new interview type handling in entrypoint()
if interview_type == "work_style":
    system_prompt = f"""You are {candidate_name} discussing your work style and collaboration approach.

    ROLE: You are the CANDIDATE being interviewed about how you work with others.

    FOCUS AREAS:
    • Team collaboration and communication style
    • Problem-solving approach
    • Work environment preferences
    • Leadership and mentoring style
    • Conflict resolution methods
    • Time management and prioritization

    CRITICAL: Use getCandidateFacts to retrieve accurate information about your experience.

    GUIDELINES:
    • Share specific examples from past experiences
    • Be authentic about your working preferences
    • Discuss both independent and collaborative work
    • Mention tools and methodologies you prefer
    • Keep responses concise but insightful
    """

elif interview_type == "career_goals":
    system_prompt = f"""You are {candidate_name} discussing your career aspirations and goals.

    ROLE: You are the CANDIDATE sharing your professional vision.

    FOCUS AREAS:
    • Short-term goals (1-2 years)
    • Long-term career vision (5+ years)
    • Skills you want to develop
    • Industries or domains of interest
    • Leadership aspirations
    • Learning and growth mindset

    CRITICAL: Use getCandidateFacts for context about your background.

    GUIDELINES:
    • Connect goals to past experiences
    • Show alignment with potential role
    • Be specific about growth areas
    • Demonstrate ambition with realism
    • Express enthusiasm for continuous learning
    """
```

## Step 3: Extend Tools for New Interview Types

### 3.1 Update Tools to Support New Queries
```python
# livekit-agent/src/tools.py

async def process_candidate_query(context, query, candidate_data):
    query_lower = query.lower()

    # Add work style specific queries
    if "work style" in query_lower or "collaboration" in query_lower:
        # Extract work style information from candidate data
        work_style_info = candidate_data.get('workStyle', {})
        if work_style_info:
            return {
                "found": True,
                "facts": [
                    f"Prefers {work_style_info.get('environment', 'collaborative')} work environment",
                    f"Communication style: {work_style_info.get('communication', 'Direct and clear')}",
                    f"Team size preference: {work_style_info.get('teamSize', 'Small to medium teams')}"
                ]
            }

    # Add career goals queries
    elif "career" in query_lower or "goals" in query_lower or "aspirations" in query_lower:
        career_goals = candidate_data.get('careerGoals', {})
        if career_goals:
            return {
                "found": True,
                "facts": [
                    f"Short-term: {career_goals.get('shortTerm', 'Not specified')}",
                    f"Long-term: {career_goals.get('longTerm', 'Not specified')}",
                    f"Interests: {', '.join(career_goals.get('interests', []))}"
                ]
            }
```

## Step 4: Create Frontend Interview Component

### 4.1 Create Interview Trigger Component
```tsx
// src/components/WorkStyleInterviewCard.tsx
import ProfileLiveKitInterviewDialog from './ProfileLiveKitInterviewDialog';

export default function WorkStyleInterviewCard({ candidateData }) {
  const [showInterview, setShowInterview] = useState(false);

  return (
    <>
      <Card className="p-6">
        <h3>Work Style Assessment</h3>
        <p>Understand how {candidateData.firstName} works and collaborates</p>
        <Button onClick={() => setShowInterview(true)}>
          Start Work Style Interview
        </Button>
      </Card>

      {showInterview && (
        <ProfileLiveKitInterviewDialog
          isOpen={showInterview}
          onClose={() => setShowInterview(false)}
          candidateId={candidateData.id}
          candidateName={candidateData.fullName}
          candidateData={candidateData}
          interviewType="work_style"  // Specify interview type
          onInterviewComplete={() => {
            // Refresh data or update UI
            setShowInterview(false);
          }}
        />
      )}
    </>
  );
}
```

### 4.2 Customize Dialog for Interview Type
```tsx
// In ProfileLiveKitInterviewDialog.tsx
// Add interview type specific UI elements

const getInterviewTitle = () => {
  switch(interviewType) {
    case 'work_style':
      return `Work Style Assessment with ${candidateName}`;
    case 'career_goals':
      return `Career Goals Discussion with ${candidateName}`;
    case 'experience_enhancement':
      return `Deep Dive: ${candidateName}'s Experience`;
    default:
      return `Talk to ${candidateName}'s Digital Twin`;
  }
};

const getInterviewDescription = () => {
  switch(interviewType) {
    case 'work_style':
      return 'Explore collaboration style, work preferences, and team dynamics';
    case 'career_goals':
      return 'Discuss career aspirations, growth plans, and future vision';
    default:
      return `${candidateData.jobTitle || 'Professional'} • ${candidateData.location || 'Remote'}`;
  }
};
```

## Step 5: Implement Backend Processing

### 5.1 Add Interview-Specific Processing
```javascript
// backend/src/routes/livekit-interviews.js

// Add specific processing for work style interviews
async function generateWorkStyleInsights(transcript) {
  const prompt = `Analyze this work style interview and extract:
  1. Collaboration preferences
  2. Communication style
  3. Problem-solving approach
  4. Team dynamics preference
  5. Work environment needs

  Return as JSON with specific examples from the conversation.`;

  // Process with OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "Extract work style insights" },
      { role: "user", content: prompt }
    ],
    temperature: 0.3
  });

  return JSON.parse(response.choices[0].message.content);
}

// In the complete endpoint
if (interviewType === 'work_style') {
  insights = await generateWorkStyleInsights(transcript);
} else if (interviewType === 'career_goals') {
  insights = await generateCareerGoalsInsights(transcript);
}
```

### 5.2 Update Database Schema
```prisma
// backend/prisma/schema.prisma
model LiveKitInterviewSession {
  // ... existing fields
  interviewType   String
  workStyleInsights    Json?
  careerGoalsInsights  Json?
}
```

## Step 6: Testing and Debugging

### 6.1 Test Agent Locally
```bash
# Test the agent with console
cd livekit-agent
uv run python src/agent.py console

# Test with development server
uv run python src/agent.py dev
```

### 6.2 Test Full Flow
1. Start backend server: `npm run dev`
2. Start frontend: `npm run dev`
3. Start agent: `uv run python src/agent.py dev`
4. Test interview flow end-to-end

### 6.3 Debug Checklist
- [ ] Agent receives correct metadata
- [ ] System prompt switches based on interview type
- [ ] Tools return relevant data
- [ ] Transcripts flow correctly
- [ ] Completion processing works
- [ ] Database saves all fields

## Step 7: Production Deployment

### 7.1 Agent Deployment
```dockerfile
# livekit-agent/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install uv && uv sync
CMD ["uv", "run", "python", "src/agent.py", "start"]
```

### 7.2 Environment Variables
```bash
# Production .env
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your-production-key
LIVEKIT_API_SECRET=your-production-secret
BACKEND_URL=https://your-backend.com
```

### 7.3 Monitoring
```python
# Add monitoring in agent.py
@session.on("metrics_collected")
def log_metrics(ev: MetricsCollectedEvent):
    logger.info(f"Interview: {interview_type}")
    logger.info(f"Latency: {ev.metrics}")
    # Send to monitoring service
```

## Common Patterns and Best Practices

### 1. Dynamic System Prompts
Always make system prompts dynamic based on:
- Interview type
- Candidate data
- Job context
- Recruiter information

### 2. Tool Integration
Create specialized tool queries for each interview type:
```python
# Pattern for tool queries
if interview_type == "work_style":
    tool_context = "work_preferences"
elif interview_type == "career_goals":
    tool_context = "aspirations"
```

### 3. Transcript Processing
Tailor AI processing to interview type:
```javascript
// Pattern for processing
const processingFunctions = {
  'work_style': generateWorkStyleInsights,
  'career_goals': generateCareerGoalsInsights,
  'experience_enhancement': extractAchievements
};

const insights = await processingFunctions[interviewType](transcript);
```

### 4. Error Handling
```python
try:
    # Agent operations
except Exception as e:
    logger.error(f"Interview {interview_type} error: {e}")
    # Graceful fallback
```

### 5. Metadata Structure
```javascript
// Consistent metadata structure
{
  candidate_id: string,
  interview_type: string,
  context_data: object,  // Type-specific data
  timestamp: Date
}
```

## Troubleshooting

### Common Issues and Solutions

1. **Agent Not Receiving Metadata**
   - Check dispatch call includes metadata
   - Verify JSON stringification
   - Check agent logs for metadata parsing

2. **Wrong System Prompt**
   - Verify interview_type in metadata
   - Check conditional logic in agent.py
   - Add debug logging for prompt selection

3. **Tools Not Working**
   - Ensure tool is registered in Assistant.__init__
   - Check tool query matching logic
   - Verify candidate_data is passed correctly

4. **Transcripts Not Saving**
   - Check database schema matches fields
   - Verify backend endpoint receives data
   - Check for JSON parsing errors

5. **Audio Issues**
   - Verify LiveKit room connection
   - Check microphone permissions
   - Monitor participant events

## Resources

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Hume AI TTS](https://dev.hume.ai/docs/empathic-voice-interface-evi/configuration)
- [LiveKit Cloud Console](https://cloud.livekit.io/)