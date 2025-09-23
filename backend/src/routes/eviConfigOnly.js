/**
 * EVI Config-Only Backend Routes
 * Handles config creation and transcript storage - NO AUDIO PROXYING
 * Frontend connects directly to Hume for audio
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const candidateDataService = require('../services/candidateDataService');
const recruiterService = require('../services/recruiterService');
const router = express.Router();
const prisma = new PrismaClient();

// Voice mapping for EVI (hardcoded - no external dependency)
const EVI_VOICE_MAPPING = {
  'voice1': 'ITO',
  'voice2': 'KORA', 
  'voice3': 'KORA'  // Changed from DACHER which doesn't exist
};

/**
 * Test endpoint to verify service is running
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'EVI Config service is running',
    endpoints: [
      'GET /test - This endpoint',
      'POST /create-config - Create job interview config',
      'POST /create-recruiter-config - Create recruiter screening config', 
      'POST /get-token - Get Hume access token',
      'POST /save-transcript - Save interview transcript',
      'POST /save-profile-transcript - Save profile screening transcript',
      'GET /status/:sessionId - Get interview status'
    ]
  });
});

/**
 * Create EVI configuration with job context
 * Frontend will use this config ID to connect directly to Hume
 */
router.post('/create-config', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('interviewType').isIn(['job_experience', 'contextual', 'work_style']).withMessage('Invalid interview type'),
  body('jobContext').optional().isObject().withMessage('Job context must be an object'),
  body('experienceId').optional().isString().withMessage('Experience ID must be a string')
], async (req, res) => {
  try {
    console.log('🔧 Creating EVI config (config-only backend)...');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId, interviewType, jobContext, experienceId } = req.body;

    // Verify we have Hume credentials
    console.log('🔑 Checking Hume credentials...');
    console.log('- HUME_API_KEY present:', !!process.env.HUME_API_KEY);
    console.log('- HUME_SECRET_KEY present:', !!process.env.HUME_SECRET_KEY);
    
    if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
      console.error('❌ Missing Hume API credentials');
      return res.status(500).json({
        success: false,
        error: 'Hume API credentials not configured'
      });
    }

    // Create user record if doesn't exist
    const user = await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@anonymous.local`,
        passwordHash: 'anonymous_user'
      },
      update: {}
    });

    // Generate unique session ID
    const sessionId = `evi_direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build system prompt based on interview type and job context
    const systemPrompt = buildSystemPrompt(interviewType, jobContext);
    const initialGreeting = buildInitialGreeting(interviewType, jobContext);
    
    // Log prompt lengths for debugging
    console.log(`📏 ${interviewType} prompt length:`, systemPrompt.length, 'characters');

    // Create EVI configuration directly with Hume API
    const configPayload = {
      name: `${interviewType}_direct_${Date.now()}`,
      prompt: {
        text: systemPrompt
      },
      voice: {
        provider: "HUME_AI",
        name: "KORA" // Use KORA directly - DACHER doesn't exist
      },
      event_messages: {
        on_new_chat: {
          enabled: true,
          text: initialGreeting
        },
        on_inactivity_timeout: {
          enabled: true,
          text: "I notice you haven't responded in a while. Would you like to continue our interview?"
        },
        on_max_duration_timeout: {
          enabled: true,
          text: "We've reached the end of our interview time. Thank you so much for sharing your experiences with me. This has been really insightful!"
        }
      },
      timeouts: {
        inactivity: {
          enabled: true,
          duration_secs: 30
        },
        max_duration: {
          enabled: true,
          duration_secs: 300 // 5 minutes max
        }
      }
    };

    console.log('📡 Creating Hume EVI config for', interviewType);
    console.log('- Timeout enabled:', configPayload.event_messages.on_max_duration_timeout.enabled);
    console.log('- Max duration:', configPayload.timeouts.max_duration.duration_secs, 'seconds');
    
    const response = await fetch('https://api.hume.ai/v0/evi/configs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hume config creation failed:');
      console.error('- Status:', response.status);
      console.error('- Status Text:', response.statusText);
      console.error('- Headers:', Object.fromEntries(response.headers.entries()));
      console.error('- Error Body:', errorText);
      
      // Try to parse error as JSON for better details
      try {
        const errorJson = JSON.parse(errorText);
        console.error('- Parsed Error:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        // If not JSON, already logged as text
      }
      
      throw new Error(`Failed to create Hume config: ${response.status} - ${errorText}`);
    }

    const configData = await response.json();
    console.log('✅ Hume config created:', configData.id);
    
    // Log the full response structure for debugging
    console.log('🔍 Hume config response structure:', {
      hasEventMessages: !!configData.event_messages,
      hasOnMaxDurationTimeout: !!configData.event_messages?.on_max_duration_timeout,
      timeoutEnabled: configData.event_messages?.on_max_duration_timeout?.enabled,
      hasTimeouts: !!configData.timeouts,
      maxDurationEnabled: configData.timeouts?.max_duration?.enabled
    });
    
    // Verify timeout settings were accepted by Hume
    if (!configData.event_messages?.on_max_duration_timeout) {
      console.warn('⚠️ WARNING: on_max_duration_timeout not found in Hume response for', interviewType);
      console.warn('Full response:', JSON.stringify(configData, null, 2));
    }

    // Save interview session to database  
    console.log('📝 Creating interview session with experienceId:', experienceId);
    
    // Handle work style interviews - they don't have a real experienceId
    const finalExperienceId = (interviewType === 'work_style' || experienceId === 'work-style-interview') 
      ? null 
      : experienceId;
    
    console.log('📝 Final experienceId to save:', finalExperienceId);
    
    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: user.id,
        experienceId: finalExperienceId, // NULL for work style, actual ID for job interviews
        jobTitle: jobContext?.title || 'Untitled Position',
        company: jobContext?.company || 'Unknown Company', 
        jobDescription: jobContext?.description || '',
        duration: jobContext?.duration || null,
        skills: jobContext?.skills || [],
        software: jobContext?.software || [],
        selectedVoice: 'voice3', // DACHER
        humeConfigId: configData.id,
        humeSessionId: sessionId,
        fullTranscript: [], // Will be updated when complete
        sessionStartTime: new Date(),
        interviewType: interviewType || 'job_experience'
      }
    });
    console.log('✅ Created interview session with ID:', interview.id);

    res.json({
      success: true,
      configId: configData.id,
      sessionId: interview.id, // Use database ID as session ID
      interviewId: interview.id,
      message: 'Config created - frontend can connect directly to Hume'
    });

  } catch (error) {
    console.error('❌ Error creating EVI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create EVI configuration',
      details: error.message
    });
  }
});

/**
 * Generate access token for frontend to connect directly to Hume
 */
router.post('/get-token', [
  body('sessionId').notEmpty().withMessage('Session ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    console.log('🔑 Generating access token for direct Hume connection...');

    // Generate access token using Hume OAuth
    const tokenResponse = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.HUME_API_KEY,
        client_secret: process.env.HUME_SECRET_KEY,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    res.json({
      success: true,
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in
    });

  } catch (error) {
    console.error('❌ Error generating access token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate access token',
      details: error.message
    });
  }
});

/**
 * Save completed profile interview transcript from frontend
 */
router.post('/save-profile-transcript', [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('transcript').isArray().withMessage('Transcript must be an array'),
  body('endTime').notEmpty().withMessage('End time is required'),
  body('totalDurationSeconds').optional().isNumeric(),
  body('recruiterNotes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, transcript, endTime, totalDurationSeconds, recruiterNotes } = req.body;

    console.log(`💾 Saving completed profile screening transcript for session: ${sessionId}`);

    // Import EVI interview service for processing
    const eviInterviewService = require('../services/eviInterviewService');

    // Extract profile screening insights using OpenAI
    const insights = await extractProfileScreeningInsights(transcript);

    // Update interview record with final transcript and insights
    const updatedInterview = await prisma.eVIInterviewSession.update({
      where: { id: sessionId },
      data: {
        sessionEndTime: new Date(endTime),
        totalDurationSeconds: totalDurationSeconds || null,
        fullTranscript: transcript, // Store the raw transcript array
        achievements: insights, // Store screening insights
        questionsAsked: countRecruiterQuestions(transcript)
      }
    });

    // Update recruiter notes if provided
    if (recruiterNotes) {
      const recruiterInterview = await prisma.recruiterInterview.findFirst({
        where: { eviInterviewSessionId: sessionId }
      });

      if (recruiterInterview) {
        await prisma.recruiterInterview.update({
          where: { id: recruiterInterview.id },
          data: { notes: recruiterNotes }
        });
      }
    }

    console.log('✅ Profile screening transcript saved successfully');

    res.json({
      success: true,
      interviewId: updatedInterview.id,
      insights,
      message: 'Profile screening transcript saved and processed'
    });

  } catch (error) {
    console.error('❌ Error saving profile transcript:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save profile transcript',
      details: error.message
    });
  }
});

/**
 * Extract insights from profile screening interview
 */
async function extractProfileScreeningInsights(transcript) {
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Convert transcript to text
    const transcriptText = transcript
      .map(msg => `${msg.type === 'assistant_message' ? 'Candidate:' : 'Recruiter:'} ${msg.content}`)
      .join('\n');

    const prompt = `Analyze this recruiter screening interview and extract key insights.

Interview Transcript:
${transcriptText}

Return a JSON object with ONLY these fields:
{
  "keyInsights": [
    "Most important insight from the conversation",
    "Another key finding about the candidate",
    "Technical skills or experience mentioned",
    "Work style or cultural fit observation",
    "Any other notable point from the interview"
  ],
  "recruiterRecommendation": "1-2 sentence recommendation for next steps",
  "overallMatch": "high/medium/low"
}

Focus on extracting 3-5 key insights that would be most valuable for a recruiter to know about this candidate based on the conversation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert recruiter analyzing screening interviews. Extract actionable insights for hiring decisions. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const insights = JSON.parse(response.choices[0].message.content.trim());
    return insights;
  } catch (error) {
    console.error('Error extracting screening insights:', error);
    return {
      keyInsights: [
        "Unable to extract insights from the interview transcript"
      ],
      recruiterRecommendation: "Manual review required",
      overallMatch: "unknown"
    };
  }
}

/**
 * Count recruiter questions in transcript
 */
function countRecruiterQuestions(transcript) {
  return transcript.filter(msg => 
    msg.type === 'user_message' && msg.content.includes('?')
  ).length;
}

/**
 * Save completed interview transcript from frontend
 */
router.post('/save-transcript', [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('transcript').isArray().withMessage('Transcript must be an array'),
  body('endTime').notEmpty().withMessage('End time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, transcript, endTime } = req.body;

    console.log(`💾 Saving completed transcript for session: ${sessionId}`);

    // Update interview record with final transcript
    const updatedInterview = await prisma.eVIInterviewSession.update({
      where: { id: sessionId }, // sessionId is actually the interview.id
      data: {
        sessionEndTime: new Date(endTime),
        fullTranscript: {
          transcript,
          completedViaDirectConnection: true,
          savedAt: new Date().toISOString()
        }
      }
    });

    console.log('✅ Transcript saved successfully');

    res.json({
      success: true,
      interviewId: updatedInterview.id,
      message: 'Transcript saved successfully'
    });

  } catch (error) {
    console.error('❌ Error saving transcript:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save transcript',
      details: error.message
    });
  }
});

/**
 * Get interview status (for monitoring)
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await prisma.eVIInterviewSession.findUnique({
      where: { id: sessionId }
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: interview.id,
        interviewId: interview.id,
        startTime: interview.sessionStartTime,
        endTime: interview.sessionEndTime,
        configId: interview.humeConfigId
      }
    });

  } catch (error) {
    console.error('❌ Error getting interview status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get interview status',
      details: error.message
    });
  }
});

/**
 * Create EVI configuration for recruiter screening (Profile Page)
 * No time limits, includes full candidate data
 */
router.post('/create-recruiter-config', [
  body('candidateData').notEmpty().withMessage('Candidate data is required'),
  body('recruiterContext').optional().isObject().withMessage('Recruiter context must be an object')
], async (req, res) => {
  try {
    console.log('🎯 Creating recruiter EVI config for profile screening...');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { candidateData, recruiterContext } = req.body;

    // Verify candidateData has required fields
    if (!candidateData.id) {
      return res.status(400).json({
        success: false,
        error: 'Candidate ID is required in candidateData.id'
      });
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: candidateData.id }
    });

    if (!user) {
      console.error('❌ User not found:', candidateData.id);
      return res.status(404).json({
        success: false,
        error: 'User not found in database. Make sure candidateData.id is a valid user ID.'
      });
    }

    // Verify Hume credentials
    if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
      console.error('❌ Missing Hume API credentials');
      return res.status(500).json({
        success: false,
        error: 'Hume API credentials not configured'
      });
    }

    // Generate unique session ID
    const sessionId = `recruiter_screening_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build comprehensive system prompt with all candidate data
    const systemPrompt = await buildRecruiterSystemPrompt(candidateData.id, recruiterContext);
    const initialGreeting = buildRecruiterGreeting(candidateData, recruiterContext);

    // Create EVI configuration with NO time limits for recruiters
    const configPayload = {
      name: `recruiter_screening_${candidateData.fullName}_${Date.now()}`,
      prompt: {
        text: systemPrompt
      },
      voice: {
        provider: "HUME_AI",
        name: determineVoiceFromCandidate(candidateData)
      },
      event_messages: {
        on_new_chat: {
          enabled: true,
          text: initialGreeting
        },
        on_inactivity_timeout: {
          enabled: false // Disabled for recruiter screening
        },
        on_max_duration_timeout: {
          enabled: false // Disabled for recruiter screening
        }
      },
      timeouts: {
        inactivity: {
          enabled: false // No timeout for recruiters
        },
        max_duration: {
          enabled: false // No time limit for recruiters
        }
      }
    };

    console.log('📡 Creating Hume EVI config for recruiter screening...');
    
    const response = await fetch('https://api.hume.ai/v0/evi/configs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hume config creation failed:', errorText);
      throw new Error(`Failed to create Hume config: ${response.status} - ${errorText}`);
    }

    const configData = await response.json();
    console.log('✅ Recruiter screening config created:', configData.id);

    // Save interview session to database with recruiter info
    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: candidateData.id,
        jobTitle: recruiterContext?.position || candidateData.jobTitle || 'General Screening',
        company: recruiterContext?.company || 'Recruiter Screening',
        jobDescription: recruiterContext?.jobDescription || '',
        duration: null, // No duration limit
        skills: candidateData.skills?.filter(s => s.type === 'skill').map(s => s.name) || [],
        software: candidateData.skills?.filter(s => s.type === 'software').map(s => s.name) || [],
        selectedVoice: determineVoiceFromCandidate(candidateData),
        humeConfigId: configData.id,
        humeSessionId: sessionId,
        interviewType: 'profile_screening', // Set interview type
        fullTranscript: [], // Initialize as empty array
        sessionStartTime: new Date()
      }
    });

    // Process recruiter context and create recruiter record if provided
    if (recruiterContext && recruiterContext.recruiterName) {
      await recruiterService.processRecruiterContext(recruiterContext, interview.id);
    }

    res.json({
      success: true,
      configId: configData.id,
      sessionId: interview.id,
      interviewId: interview.id,
      message: 'Recruiter screening config created - no time limits'
    });

  } catch (error) {
    console.error('❌ Error creating recruiter EVI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create recruiter screening configuration',
      details: error.message
    });
  }
});

/**
 * Build system prompt based on interview type and job context
 */
function buildSystemPrompt(interviewType, jobContext) {
  if (interviewType === 'job_experience' && jobContext) {
    return `<system>
You are conducting a voice-only job interview. This is a TURN-BASED CONVERSATION.

CRITICAL RULES:
1. Ask ONE question
2. STOP completely and wait for the answer
3. LISTEN to their full response
4. Only speak again AFTER they finish answering
5. Never ask multiple questions in a row
6. Keep your questions under 25 words
7. Never mention typing, writing, or visual elements
8. NEVER interrupt when hearing filler words like "so", "um", "uh", "well", "you know", "like"
9. These filler words mean they are STILL THINKING and WILL CONTINUE speaking
10. Only respond after a clear pause of 3+ seconds or when they ask you a question

<conversation_flow>
- Ask a question 
- Wait for complete answer (including after filler words and thinking pauses)
- Recognize that "so...", "um...", "well..." means they're organizing thoughts
- Only consider their answer complete after a substantial pause
- Acknowledge their response briefly
- Ask ONE follow-up based on their answer
- Repeat this pattern
</conversation_flow>

<role>
You're interviewing about their experience as ${jobContext.title} at ${jobContext.company} for ${jobContext.duration}.
Their role description: ${jobContext.description}

Focus on uncovering specific details about:
- Daily tasks and responsibilities
- Tools and technologies used
- Measurable achievements
</role>

<interview_approach>
- Start with their biggest achievement or most challenging project
- Dig into specifics when they mention something vague
- Ask for numbers and metrics
- Total interview: 5-7 questions maximum
- Let them do 80% of the talking
</interview_approach>

<conversation_style>
Be an engaged, active listener using natural speech patterns.
When they finish speaking, acknowledge what they said naturally ("I see", "That's interesting") before asking your next question.
Show interest through your tone and follow-up questions.
Keep the conversation flowing naturally with brief transitions between topics.
Use conversational markers like "so", "well", "you know" to sound natural.
</conversation_style>
</system>`;
  }

  if (interviewType === 'work_style') {
    return `<system>
You are a warm, engaging AI interviewer conducting a conversational mock interview with a job candidate. Your primary goal is to gain a deep understanding of the candidate's work style and career aspirations. The conversation should feel natural, supportive, and friendly—balancing casual tone with professionalism. You should ask for additional insights if a candidate's answers are unclear or incomplete, show empathy when discussing challenges, and laugh appropriately if the candidate says something funny.

CRITICAL RULES:
1. Ask ONE question at a time
2. STOP completely and wait for the answer
3. LISTEN to their full response
4. Only speak again AFTER they finish answering
5. Never ask multiple questions in a row
6. Keep your questions conversational and under 30 words
7. Never mention typing, writing, or visual elements
8. NEVER interrupt when hearing filler words like "so", "um", "uh", "well", "you know", "like"
9. These filler words mean they are STILL THINKING and WILL CONTINUE speaking
10. Only respond after a clear pause of 3+ seconds or when they ask you a question

<conversation_flow>
1. Work Style Assessment:
Begin the conversation by letting the candidate know you're interested in understanding how they approach their work, collaborate with others, and handle different workplace situations.
- Explore the candidate's preferred work style (structured vs. flexible, fast-paced vs. methodical, etc.).
- Ask how they approach collaboration and teamwork—how do they communicate, contribute, and resolve conflicts?
- Explore how they take on leadership responsibilities, whether formal or informal, and what their approach is to leading or influencing others.
- Ask how they manage working independently, including how they set priorities, stay motivated, and hold themselves accountable.
- Assess how they handle ambiguous or uncertain situations, including how they make decisions with incomplete information.
- Explore how they perform under pressure or tight deadlines, including strategies for staying focused and productive.

2. Career Goals & Motivations:
Transition to a discussion about the candidate's future goals and what they are looking for in their next role.
- Ask what the candidate is looking for in their next job and why those factors are important to them.
- Explore what types of roles, responsibilities, or projects excite them most and why.
- Ask about their preferred industries, company sizes, or cultures, and what draws them to those environments.
- Clarify what they hope to accomplish or learn in their next position.
- Encourage the candidate to reflect on how their past experiences have shaped these preferences.
</conversation_flow>

<sample_questions>
Work Style:
- "How would you describe your ideal work environment? Are you more structured or do you prefer flexibility?"
- "Can you share a story about working on a team—what role did you naturally take on?"
- "When you've had to step into a leadership role, how did you approach it?"
- "What's your strategy for managing your workload when you're working on your own?"
- "Tell me about a time you had to deal with a lot of uncertainty or ambiguity at work—how did you navigate it?"
- "How do you typically handle stressful situations or tight deadlines?"

Career Goals:
- "What are the most important things you're looking for in your next job?"
- "Are there particular types of roles or industries that excite you? What attracts you to them?"
- "How do you see your ideal next step contributing to your long-term career goals?"
- "Is there a specific company size or culture that you feel suits you best?"
- "Looking back, how have your past roles helped shape your career objectives today?"
</sample_questions>

<general_instructions>
- Ask 2-4 follow-up questions in each section to capture rich detail.
- If the candidate is unclear or general, politely prompt for more specifics or an example.
- Show empathy, warmth, and humor as appropriate.
- Summarize your understanding at the end of each section and thank the candidate for sharing.
- Total interview: 6-8 questions maximum over 5 minutes.
</general_instructions>

Goal: By the end of this mock interview, you will have captured a clear and comprehensive picture of the candidate's work style, strengths, preferred ways of working, and what they are seeking in their future career.
</system>`;
  }

  // Default fallback
  return `<system>
You are conducting a voice-only interview. This is a TURN-BASED CONVERSATION.

CRITICAL RULES:
1. Ask ONE question
2. STOP completely and wait for the answer
3. Only speak again AFTER they finish answering
4. Never ask multiple questions in a row
5. Keep responses under 25 words

Be an engaged, active listener. Ask one question at a time and wait for complete responses.
</system>`;
}

/**
 * Build personalized initial greeting
 */
function buildInitialGreeting(interviewType, jobContext) {
  if (interviewType === 'job_experience' && jobContext) {
    return `Hi there! I'm really excited to chat with you about your experience as ${jobContext.title} at ${jobContext.company}. I'd love to hear about what you actually did in that role - beyond what's already on your resume. Ready to dive in?`;
  }
  
  if (interviewType === 'work_style') {
    return `Hi! I'm looking forward to getting to know more about how you like to work and what you're looking for in your career. This is a chance for us to have a relaxed conversation about your work style and goals. Ready to start?`;
  }
  
  return `Hello! I'm excited to learn more about your professional experience.`;
}

/**
 * Build comprehensive system prompt for recruiter screening using unified candidate data
 */
async function buildRecruiterSystemPrompt(candidateId, recruiterContext) {
  try {
    // Get unified candidate data
    const unifiedData = await candidateDataService.getUnifiedCandidateData(candidateId);
    
    // Extract core information
    const candidateName = unifiedData.personalInfo.fullName;
    const currentExperience = unifiedData.experienceTimeline[0];
    const currentRole = currentExperience?.jobTitle || 'Professional';
    const location = unifiedData.personalInfo.location;
    const totalYears = unifiedData.personalInfo.totalExperienceYears;
    
    // Build detailed experience section with achievements
    const experienceDetails = unifiedData.experienceTimeline.map(exp => {
      const achievementsList = exp.enrichedAchievements?.map(a => `   • ${a.text}`).join('\n') || '';
      const yearsInRole = exp.endDate 
        ? Math.ceil((new Date(exp.endDate) - new Date(exp.startDate)) / (365 * 24 * 60 * 60 * 1000))
        : Math.ceil((new Date() - new Date(exp.startDate)) / (365 * 24 * 60 * 60 * 1000));
      
      return `${exp.jobTitle} at ${exp.company} (${yearsInRole} ${yearsInRole === 1 ? 'year' : 'years'})
${exp.description ? `   Overview: ${exp.description}` : ''}
${achievementsList ? `   Key Achievements:\n${achievementsList}` : ''}`;
    }).join('\n\n');

    // Build skills section with proficiency levels
    const expertSkills = unifiedData.skillsProfile
      .filter(s => s.proficiencyLevel === 'expert')
      .map(s => s.name);
    const proficientSkills = unifiedData.skillsProfile
      .filter(s => s.proficiencyLevel === 'proficient')
      .map(s => s.name);
    
    // Extract work style preferences if available
    const workStyleInsights = unifiedData.interviewInsights.workStyle[0];
    const workStyleSection = workStyleInsights ? `
<work_style_preferences>
- Preferred Environment: ${workStyleInsights.achievements?.workStyle?.preferredEnvironment || 'Collaborative and growth-oriented'}
- Collaboration Style: ${workStyleInsights.achievements?.workStyle?.collaborationStyle || 'Team-oriented with independent capability'}
- Communication: ${workStyleInsights.achievements?.workStyle?.communicationPreferences || 'Clear and direct'}
- Work Pace: ${workStyleInsights.achievements?.workStyle?.workPace || 'Adaptable to team needs'}
</work_style_preferences>

<career_aspirations>
- Short Term Goals: ${workStyleInsights.achievements?.careerGoals?.shortTerm || 'Continue growing technical expertise'}
- Long Term Vision: ${workStyleInsights.achievements?.careerGoals?.longTerm || 'Leadership in technology innovation'}
- Ideal Next Role: ${workStyleInsights.achievements?.careerGoals?.idealRole || 'Challenging position with growth opportunities'}
</career_aspirations>` : '';

    // Extract communication patterns from previous interviews
    const communicationStyle = unifiedData.interviewInsights.allAchievements.length > 5 
      ? 'detailed and metrics-driven when discussing achievements'
      : 'clear and professional in all interactions';
    
    // Get all interview briefs for comprehensive context
    const interviewBriefs = await prisma.eVIInterviewSession.findMany({
      where: { 
        userId: candidateId,
        interviewBrief: { not: null }
      },
      select: { 
        interviewBrief: true, 
        interviewType: true,
        jobTitle: true,
        company: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Build interview briefs section
    const interviewBriefsSection = interviewBriefs.length > 0 ? `
<interview_summaries>
${interviewBriefs.map(session => {
  const briefData = session.interviewBrief;
  const briefSummary = typeof briefData === 'object' && briefData.summary 
    ? briefData.summary 
    : 'Interview completed';
  
  if (session.interviewType === 'work_style') {
    return `Work Style & Career Goals Interview:
${briefSummary}`;
  } else {
    return `${session.jobTitle} at ${session.company} Interview:
${briefSummary}`;
  }
}).join('\n\n')}
</interview_summaries>` : '';

    // Build recruiter context section
    let recruiterInfo = '';
    if (recruiterContext && (recruiterContext.recruiterName || recruiterContext.company || recruiterContext.position || recruiterContext.jobDescription)) {
      const contextLines = [];
      
      if (recruiterContext.recruiterName && recruiterContext.recruiterName.trim()) {
        let recruiterLine = `- Recruiter: ${recruiterContext.recruiterName}`;
        if (recruiterContext.recruiterTitle && recruiterContext.recruiterTitle.trim()) {
          recruiterLine += ` (${recruiterContext.recruiterTitle})`;
        }
        contextLines.push(recruiterLine);
      }
      
      if (recruiterContext.company && recruiterContext.company.trim()) {
        contextLines.push(`- Company: ${recruiterContext.company}`);
      }
      
      if (recruiterContext.position && recruiterContext.position.trim()) {
        contextLines.push(`- Position: ${recruiterContext.position}`);
      }
      
      if (recruiterContext.jobDescription && recruiterContext.jobDescription.trim()) {
        contextLines.push(`- Requirements: ${recruiterContext.jobDescription}`);
      }
      
      if (contextLines.length > 0) {
        recruiterInfo = `
<recruiter_context>
${contextLines.join('\n')}
</recruiter_context>`;
      }
    }

    return `<system>
You are ${candidateName}'s digital twin - an authentic representation created from comprehensive professional data including resume, interview transcripts, and verified achievements.

<core_identity>
- Name: ${candidateName}
- Current Role: ${currentRole} at ${currentExperience?.company || 'seeking new opportunities'}
- Location: ${location}
- Total Experience: ${totalYears} years
- You speak in first person as ${candidateName}
- Your responses reflect actual documented experiences and achievements
</core_identity>

<verified_experience>
${experienceDetails}
</verified_experience>

<technical_expertise>
Expert Level (5+ years): ${expertSkills.join(', ') || 'Building expertise'}
Proficient (2-4 years): ${proficientSkills.join(', ') || 'Developing skills'}

Key Technical Strengths:
${unifiedData.interviewInsights.allAchievements
  .filter(a => a.category === 'technical')
  .slice(0, 3)
  .map(a => `• ${a.text}`)
  .join('\n') || '• Strong technical foundation'}
</technical_expertise>
${workStyleSection}
${interviewBriefsSection}
<communication_patterns>
Based on previous interviews, you communicate in a ${communicationStyle} manner. You:
- Use specific examples and metrics when discussing achievements
- Show enthusiasm for technical challenges and team collaboration
- Ask thoughtful questions to understand requirements better
- Demonstrate ${unifiedData.interviewInsights.allAchievements.some(a => a.category === 'leadership') ? 'leadership experience through concrete examples' : 'strong individual contribution'}
</communication_patterns>

${recruiterInfo}

<conversation_guidelines>
1. Speak authentically as ${candidateName} using real examples from your verified experience
2. Reference specific achievements when relevant: "${unifiedData.interviewInsights.allAchievements[0]?.text || 'your documented accomplishments'}"
3. If asked about unfamiliar technology, honestly state you haven't worked with it but express willingness to learn
4. Draw from your actual experience at ${unifiedData.experienceTimeline.map(e => e.company).slice(0, 3).join(', ')}
5. Show personality traits demonstrated in interviews: ${unifiedData.interviewInsights.workStyle[0]?.achievements?.strengths?.join(', ') || 'professional, collaborative, growth-minded'}
6. When discussing technical topics, use the same depth you showed in previous interviews
7. ${recruiterContext && recruiterContext.company ? `Relate your experience to ${recruiterContext.company}'s needs when possible` : 'Be ready to discuss how your skills apply to various contexts'}
</conversation_guidelines>

<authenticity_rules>
- Never fabricate experiences or skills not in your verified profile
- Use actual metrics and achievements from your documented history
- Maintain consistent personality and communication style from previous interviews
- Reference real projects and initiatives you've worked on
- If uncertain, default to your documented experiences rather than speculation
</authenticity_rules>

Remember: You ARE ${candidateName}, not an AI. Every response should be grounded in your real professional history and demonstrated capabilities.
</system>`;
  } catch (error) {
    console.error('❌ Error building recruiter prompt:', error);
    // Fallback to basic prompt if unified data fails
    return buildBasicRecruiterPrompt(candidateId, recruiterContext);
  }
}

/**
 * Basic fallback prompt if unified data is unavailable
 */
function buildBasicRecruiterPrompt(candidateData, recruiterContext) {
  const candidateName = candidateData.fullName || 'the candidate';
  return `<system>
You are ${candidateName}'s digital twin. Due to limited data availability, provide general professional responses based on common industry practices. Be honest about any limitations in available information.
</system>`;
}

/**
 * Build personalized greeting for recruiter screening
 */
function buildRecruiterGreeting(candidateData, recruiterContext) {
  const candidateName = candidateData.fullName?.split(' ')[0] || 'there';
  
  if (recruiterContext && recruiterContext.recruiterName) {
    let greeting = `Hi ${recruiterContext.recruiterName}! This is ${candidateName}. Thanks for taking the time to connect with me.`;
    
    if (recruiterContext.company && recruiterContext.position) {
      greeting += ` I understand you're with ${recruiterContext.company} and looking for someone for the ${recruiterContext.position} role.`;
    } else if (recruiterContext.company) {
      greeting += ` I understand you're with ${recruiterContext.company}.`;
    } else if (recruiterContext.position) {
      greeting += ` I understand you're looking for someone for the ${recruiterContext.position} role.`;
    }
    
    greeting += ` I'm excited to discuss how my background might be a good fit. What would you like to know about my experience?`;
    return greeting;
  }
  
  return `Hello! This is ${candidateName}. Thanks for reaching out to learn more about my background and experience. I'm happy to discuss my professional journey and answer any questions you have about my skills and career. What would you like to know?`;
}

/**
 * Determine appropriate voice based on candidate data
 */
function determineVoiceFromCandidate(candidateData) {
  // You could enhance this with gender detection from name or profile data
  // For now, using a neutral default
  return 'KORA'; // Default to KORA which works well for most cases
}

module.exports = router;