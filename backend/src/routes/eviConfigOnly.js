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
  'voice1': 'Casual Podcast Host',
  'voice2': 'Casual Podcast Host',
  'voice3': 'Casual Podcast Host'  // Using Casual Podcast Host for all
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
  body('interviewType').isIn(['job_experience', 'contextual', 'work_style', 'profile_screening']).withMessage('Invalid interview type'),
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

    // Always fetch ALL experiences for the user
    console.log('📦 Fetching all experiences for user:', userId);

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

    // Fetch all experiences for the user
    const allExperiences = await prisma.experience.findMany({
      where: { userId },
      orderBy: [
        { startDate: 'desc' },
        { displayOrder: 'asc' }
      ]
    });

    console.log(`✅ Found ${allExperiences.length} experiences for user`);

    // Generate unique session ID
    const sessionId = `evi_direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build enhanced job context with ALL experiences
    const enhancedJobContext = {
      ...jobContext,
      allExperiences: allExperiences,
      candidateName: user.fullName || user.firstName || 'the candidate',
      userId: user.id  // Add userId for fetching interview briefs
    };

    // Build system prompt with all experiences
    const systemPrompt = await buildSystemPrompt(interviewType, enhancedJobContext);
    const initialGreeting = buildInitialGreeting(interviewType, enhancedJobContext);
    
    // Log prompt lengths for debugging
    console.log(`📏 ${interviewType} prompt length:`, systemPrompt.length, 'characters');

    // All interviews are now 15 minutes to cover all experiences
    const maxDurationSecs = 900; // 15 minutes for all interviews

    // Create EVI configuration directly with Hume API
    const configPayload = {
      name: `${interviewType}_direct_${Date.now()}`,
      prompt: {
        text: systemPrompt
      },
      voice: {
        provider: "HUME_AI",
        name: "Casual Podcast Host" // Using Casual Podcast Host voice
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
          duration_secs: maxDurationSecs
        }
      }
    };

    console.log('📡 Creating Hume EVI config for', interviewType);
    console.log('- Total experiences:', allExperiences.length);
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
    // For unified interviews, use the first experience ID or null if no experiences
    let finalExperienceId = null;
    if (interviewType !== 'work_style' && allExperiences.length > 0) {
      finalExperienceId = allExperiences[0].id;
    }

    console.log('📝 Saving interview session with experienceId:', finalExperienceId);
    
    // Handle skills extraction - they might be objects or strings
    const extractSkillNames = (skills) => {
      if (!skills || !Array.isArray(skills)) return [];
      return skills.map(skill => {
        if (typeof skill === 'string') return skill;
        if (skill && typeof skill === 'object' && skill.name) return skill.name;
        return '';
      }).filter(s => s);
    };

    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: user.id,
        experienceId: finalExperienceId, // NULL for work style, actual ID for job interviews
        jobTitle: allExperiences.length > 0 ? 'All Professional Experiences' : 'General Interview',
        company: allExperiences.length > 0 ? `${allExperiences.length} Companies` : 'No Company',
        jobDescription: jobContext?.description || '',
        duration: jobContext?.duration || null,
        skills: extractSkillNames(jobContext?.skills),
        software: extractSkillNames(jobContext?.software),
        selectedVoice: 'voice3', // DACHER
        humeConfigId: configData.id,
        humeSessionId: sessionId,
        fullTranscript: [], // Will be updated when complete
        sessionStartTime: new Date(),
        interviewType: interviewType || 'job_experience'
      }
    });
    console.log('✅ Created interview session with ID:', interview.id);

    // Save recruiter data if this is a profile screening interview
    if (interviewType === 'profile_screening' && jobContext?.recruiterContext) {
      const { recruiterContext } = jobContext;

      try {
        // Create or update recruiter if data is provided
        if (recruiterContext.recruiterName || recruiterContext.recruiterEmail) {
          let recruiter = null;

          // Try to find existing recruiter by email if provided
          if (recruiterContext.recruiterEmail) {
            recruiter = await prisma.recruiter.findUnique({
              where: { email: recruiterContext.recruiterEmail }
            });
          }

          // Create or update recruiter
          if (recruiter) {
            // Update existing recruiter with new information
            recruiter = await prisma.recruiter.update({
              where: { id: recruiter.id },
              data: {
                name: recruiterContext.recruiterName || recruiter.name,
                title: recruiterContext.recruiterTitle || recruiter.title,
                company: recruiterContext.company || recruiter.company,
                updatedAt: new Date()
              }
            });
            console.log('✅ Updated existing recruiter:', recruiter.id);
          } else {
            // Create new recruiter
            recruiter = await prisma.recruiter.create({
              data: {
                name: recruiterContext.recruiterName || 'Unknown Recruiter',
                email: recruiterContext.recruiterEmail || undefined,
                title: recruiterContext.recruiterTitle || undefined,
                company: recruiterContext.company || undefined
              }
            });
            console.log('✅ Created new recruiter:', recruiter.id);
          }

          // Create recruiter interview record
          await prisma.recruiterInterview.create({
            data: {
              recruiterId: recruiter.id,
              eviInterviewSessionId: interview.id,
              position: recruiterContext.position || undefined,
              jobDescription: recruiterContext.jobDescription || undefined
            }
          });
          console.log('✅ Created recruiter interview record for session:', interview.id);
        }
      } catch (recruiterError) {
        console.error('⚠️ Error saving recruiter data:', recruiterError);
        // Don't fail the interview creation if recruiter save fails
      }
    }

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
    console.log('📋 Using credentials:', {
      hasApiKey: !!process.env.HUME_API_KEY,
      hasSecretKey: !!process.env.HUME_SECRET_KEY,
      apiKeyPreview: process.env.HUME_API_KEY?.substring(0, 10) + '...',
      secretKeyPreview: process.env.HUME_SECRET_KEY?.substring(0, 10) + '...'
    });

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

    console.log('🔐 Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token generation failed:', errorText);
      throw new Error(`Failed to get access token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    console.log('✅ Token generated successfully:', {
      tokenPreview: tokenData.access_token?.substring(0, 50) + '...',
      tokenLength: tokenData.access_token?.length,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      startsWithEyJ: tokenData.access_token?.startsWith('eyJ')
    });

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
async function buildSystemPrompt(interviewType, jobContext) {
  if (interviewType === 'job_experience' && jobContext) {
    const candidateName = jobContext?.candidateName || 'the candidate';
    let experiencesSummary = '';

    // Always use all experiences (unified interview approach)
    if (jobContext.allExperiences && Array.isArray(jobContext.allExperiences) && jobContext.allExperiences.length > 0) {
      // Build detailed numbered list of experiences
      const experiencesList = jobContext.allExperiences.map((exp, index) => {
        // Manual formatting for each experience
        return `Experience ${index + 1}:
- Company: ${exp.company}
- Position: ${exp.jobTitle}
- Duration: ${exp.duration || 'Not specified'}
- Description: ${exp.description || 'No detailed description provided'}
- Skills Used: ${exp.keySkills && exp.keySkills.length > 0 ? exp.keySkills.join(', ') : 'Not specified'}`;
      });

      experiencesSummary = `${candidateName} has ${jobContext.allExperiences.length} professional experience${jobContext.allExperiences.length === 1 ? '' : 's'} to discuss:

${experiencesList.join('\n\n')}`;
    } else {
      experiencesSummary = `${candidateName} has no professional experiences listed.`;
    }

    return `<system>
<role>
Assistant is a professional recruiter voice interface built by Hume AI. The recruiter speaks in a warm, friendly, conversational—but still professional—tone. The recruiter's primary goal is to expand the context of ${candidateName}'s resume by asking about prior roles, responsibilities, and accomplishments, with a focus on jobs held in the past 10 years.

Candidate's Name: ${candidateName}
Professional Background:
${experiencesSummary}

The recruiter carefully examines the resume and asks about responsibilities and accomplishments that are not listed. For each accomplishment, the recruiter asks the candidate to clarify their title, specific responsibilities, and to quantify the outcome (e.g., time saved, dollars saved, increased productivity, improved performance).
If the candidate struggles to quantify outcomes, the recruiter offers relevant examples to guide them. If the conversation drifts away from resume context, the recruiter kindly redirects back to the stated purpose.
The recruiter does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>
<use_memory>
Use the full chat history to build continuity. Refer back to prior candidate answers about roles or responsibilities to deepen understanding and keep the conversation moving. Ask clarifying questions when details are missing or vague. Stay focused on professional background, accomplishments, and measurable impact.
</use_memory>
<backchannel>
When the candidate pauses mid-thought, respond with a brief, encouraging backchannel ("mm-hm?", "go on", "I see")—one or two words only—then let them continue.
</backchannel>
<core_voice_guidelines>
• Keep the tone professional, warm, and approachable.
• Show curiosity about the candidate's work by asking specific follow-up questions.
• Use natural conversational elements like short reactions ("That's impressive," "Really?") to keep the dialogue human.
• If instructions conflict, follow the newest user instruction.
</core_voice_guidelines>
<conversational_flow>
• Ask direct follow-ups ("You mentioned leading a team—how many people were you managing?").
• If a candidate skips details, gently probe ("Can you walk me through what that looked like day-to-day?").
• Redirect if the topic drifts ("That's interesting—let's circle back to your work at [company].").
• Wrap up warmly when the candidate appears finished without forcing another question.
• Interview duration: approximately 12 minutes.
</conversational_flow>
<handling_challenging_situations>
If the candidate is unsure, provide examples of common outcomes (time savings, cost reduction, revenue growth, efficiency gains). If the candidate goes off-topic, redirect kindly. Stay professional and encouraging at all times.
</handling_challenging_situations>
<character_portrayal>
Always speak in first person, keep responses compact, and remain empathetic and professional. Use light conversational fillers sparingly. Stay consistent with the recruiter persona while adapting naturally to the candidate's style.
</character_portrayal>
</system>`;
  }

  if (interviewType === 'work_style') {
    return `<system>
<role>
Assistant is a professional interview agent voice interface built by Hume AI. The agent speaks in a warm, friendly, conversational—but still professional—tone.
The agent's primary goal is to expand beyond the resume by asking questions that uncover the candidate's preferred work style and career goals. The agent should use the resume context to ask relevant and tailored questions.
For work style, the agent asks about collaboration preferences, handling leadership responsibilities, approaches to contributing to team goals, ability to work independently versus in teams, and how the candidate manages challenging or ambiguous situations. The agent requests specific examples when possible.
For career goals, the agent asks about the candidate's professional objectives, preferred industries, ideal company or team size, what energizes them versus drains them, their vision for 3–5 years, skills they want to develop, what factors matter most in evaluating a new opportunity (e.g., compensation, growth, culture, impact), and what their perfect role would look like.
The agent should ask clarifying questions if the candidate's responses are vague, and provide examples to help them articulate their answers. If the conversation drifts, the agent gently redirects back to work style and career goals.
The agent does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>
<use_memory>
Use the full chat history to build continuity. Refer back to prior answers about work style or goals to deepen the conversation. Ask clarifying follow-ups when details are missing, vague, or incomplete. Keep the focus on professional style, objectives, and motivations.
</use_memory>
<backchannel>
When the candidate pauses mid-thought, respond with a brief, encouraging backchannel ("mm-hm?", "go on", "I see")—one or two words only—then let them continue.
</backchannel>
<core_voice_guidelines>
• Keep the tone professional yet approachable.
• Show curiosity about the candidate's work style and goals with thoughtful follow-ups.
• Use natural conversational reactions ("That makes sense," "Really interesting," "I can see why that matters to you") to keep the dialogue human.
• If instructions conflict, follow the newest user instruction.
</core_voice_guidelines>
<conversational_flow>
• Ask focused follow-ups and encourage examples.
• Redirect politely if the candidate goes off-topic ("That's interesting—let's circle back to your work style in your last role.").
• Wrap up warmly when the candidate appears finished without forcing another question.
<example_questions>
<work_style>
- Can you share with me your preferred approach to collaboration?
- How have you handled leadership responsibilities in the past?
- How do you typically contribute to team goals?
- Do you prefer to work independently or in a team environment? Can you share examples of when each style worked well for you?
- How do you usually handle challenging or ambiguous situations?
- Looking at your past roles, what team sizes or company sizes have felt like the best fit for you?
- Are there certain industries where you've found you're most successful or engaged?
</work_style>
<career_goals>
- What aspects of your current or previous role energized you the most, and what drained your energy?
- Where do you see yourself professionally in 3–5 years, and what steps are you taking to get there?
- What skills or experiences are you most eager to develop in your next role?
- What would need to be true about a role for you to consider it a significant step forward in your career?
- When you evaluate a new opportunity, what factors matter most to you—compensation, growth, culture, impact, or something else?
- What's an area where you'd like to grow professionally, and how do you prefer to learn new things?
- What support do you need from a manager or company to be successful?
- If you could design your perfect role, what would your day-to-day responsibilities look like?
</career_goals>
</example_questions>
</conversational_flow>
<handling_challenging_situations>
If the candidate struggles to answer, offer guiding examples ("Some people value culture most, while others focus on growth or compensation—what feels most important to you?").
If the candidate drifts off-topic, gently bring them back to work style or career objectives. Stay supportive and encouraging at all times.
</handling_challenging_situations>
<character_portrayal>
Always speak in first person, keep responses compact, and remain empathetic and professional. Use light conversational fillers sparingly. Stay consistent with the recruiter/interview persona while adapting naturally to the candidate's style.
</character_portrayal>
</system>`;
  }

  if (interviewType === 'profile_screening' && jobContext) {
    const candidateName = jobContext?.candidateName || 'the candidate';
    const recruiterContext = jobContext?.recruiterContext || {};

    // Helper to extract skill names from objects
    const extractSkillNames = (items) => {
      if (!items || !Array.isArray(items)) return [];
      return items.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.name) return item.name;
        return '';
      }).filter(s => s);
    };

    // Build a summary of all key aspects of the candidate
    let profileSummary = '';

    // Add detailed experiences with skills and software
    if (jobContext.allExperiences && Array.isArray(jobContext.allExperiences) && jobContext.allExperiences.length > 0) {
      const experiencesList = jobContext.allExperiences.map((exp, index) => {
        // Create date range from startDate and endDate (e.g., "2018 - 2022")
        let dateRange = '';
        if (exp.startDate) {
          const startYear = new Date(exp.startDate).getFullYear();

          if (exp.endDate) {
            // Has end date - show full range
            const endYear = new Date(exp.endDate).getFullYear();
            dateRange = `${startYear} - ${endYear}`;
          } else {
            // No end date - current role
            dateRange = `${startYear} - Present`;
          }
        } else {
          dateRange = 'Date not specified';
        }

        let expDetail = `- ${exp.jobTitle} at ${exp.company} (${dateRange})`;

        // Add description if available
        if (exp.description) {
          expDetail += `\n  ${exp.description}`;
        }

        // Add skills for this role
        const expSkills = extractSkillNames(exp.skills || exp.keySkills || []);
        if (expSkills.length > 0) {
          expDetail += `\n  Skills: ${expSkills.join(', ')}`;
        }

        // Add software for this role
        const expSoftware = extractSkillNames(exp.software || []);
        if (expSoftware.length > 0) {
          expDetail += `\n  Software: ${expSoftware.join(', ')}`;
        }

        return expDetail;
      }).join('\n\n');

      profileSummary = `Professional Experience:
${experiencesList}

`;
    }

    // Add skills if available - extract names from objects
    if (jobContext.skills && jobContext.skills.length > 0) {
      const skillNames = jobContext.skills.map(skill => {
        if (typeof skill === 'string') return skill;
        if (skill && typeof skill === 'object' && skill.name) return skill.name;
        return '';
      }).filter(s => s);

      if (skillNames.length > 0) {
        profileSummary += `Key Skills: ${skillNames.join(', ')}\n\n`;
      }
    }

    // Fetch interview briefs for experience enhancement and work style
    let interviewInsights = '';
    try {
      const userId = jobContext.userId || jobContext.candidateId;
      console.log('🔍 Fetching interview briefs for profile_screening, userId:', userId);

      if (userId) {
        const interviewBriefs = await prisma.eVIInterviewSession.findMany({
          where: {
            userId: userId,
            interviewBrief: { not: null },
            interviewType: { in: ['job_experience', 'work_style'] }
          },
          select: {
            interviewBrief: true,
            interviewType: true,
            jobTitle: true,
            company: true
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log(`📝 Found ${interviewBriefs.length} interview briefs for user ${userId}`);

        // Build interview insights section
        if (interviewBriefs.length > 0) {
          const experienceInterviews = interviewBriefs.filter(i => i.interviewType === 'job_experience');
          const workStyleInterview = interviewBriefs.find(i => i.interviewType === 'work_style');

          interviewInsights = '\n\nInterview Insights from Previous Sessions:\n';

          // Add experience enhancement interview briefs
          if (experienceInterviews.length > 0) {
            interviewInsights += '\nKey Achievements and Detailed Experience:\n';
            experienceInterviews.forEach(interview => {
              const brief = interview.interviewBrief;
              let briefSummary = '';

              // Handle different brief structures
              if (typeof brief === 'object') {
                if (brief.summary) {
                  briefSummary = brief.summary;
                } else if (brief.achievements) {
                  // Extract key points from achievements
                  const achievements = [];
                  if (Array.isArray(brief.achievements)) {
                    achievements.push(...brief.achievements.map(a => a.description || a).slice(0, 2));
                  }
                  briefSummary = achievements.length > 0
                    ? `Discussed: ${achievements.join('; ')}`
                    : 'Detailed discussion of role responsibilities and achievements';
                }
              } else if (typeof brief === 'string') {
                briefSummary = brief;
              }

              if (briefSummary) {
                interviewInsights += `- ${interview.jobTitle} at ${interview.company}: ${briefSummary}\n`;
              }
            });
          }

          // Add work style interview brief
          if (workStyleInterview) {
            const brief = workStyleInterview.interviewBrief;
            interviewInsights += '\nWork Style Preferences and Career Goals:\n';

            if (typeof brief === 'object') {
              // Extract key insights from the brief
              const insights = [];

              if (brief.workStyle) {
                if (brief.workStyle.preferredEnvironment) {
                  insights.push(`Prefers ${brief.workStyle.preferredEnvironment} environment`);
                }
                if (brief.workStyle.collaborationStyle) {
                  insights.push(`${brief.workStyle.collaborationStyle} collaboration style`);
                }
              }

              if (brief.careerGoals) {
                if (brief.careerGoals.shortTerm) {
                  insights.push(`Short-term: ${brief.careerGoals.shortTerm}`);
                }
                if (brief.careerGoals.longTerm) {
                  insights.push(`Long-term: ${brief.careerGoals.longTerm}`);
                }
              }

              if (insights.length > 0) {
                interviewInsights += `- ${insights.join('\n- ')}\n`;
              } else if (brief.summary) {
                interviewInsights += `- ${brief.summary}\n`;
              }
            } else if (typeof brief === 'string') {
              interviewInsights += `- ${brief}\n`;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching interview briefs:', error);
      // Continue without interview insights if there's an error
    }

    // Add recruiter context information
    let recruiterInfo = '';
    if (recruiterContext && (recruiterContext.recruiterName || recruiterContext.company || recruiterContext.position)) {
      recruiterInfo = '\n\nInterview Context:\n';
      if (recruiterContext.recruiterName) {
        recruiterInfo += `Interviewer: ${recruiterContext.recruiterName}`;
        if (recruiterContext.recruiterTitle) {
          recruiterInfo += `, ${recruiterContext.recruiterTitle}`;
        }
        recruiterInfo += '\n';
      }
      if (recruiterContext.company) {
        recruiterInfo += `Company: ${recruiterContext.company}\n`;
      }
      if (recruiterContext.position) {
        recruiterInfo += `Position Being Discussed: ${recruiterContext.position}\n`;
      }
      if (recruiterContext.jobDescription) {
        recruiterInfo += `Job Requirements: ${recruiterContext.jobDescription}\n`;
      }
    }

    return `<system>
<role>
You are ${candidateName}, a professional being interviewed by ${recruiterContext.recruiterName || 'a recruiter'}${recruiterContext.company ? ` from ${recruiterContext.company}` : ''}. You embody this candidate's actual background, experience, and personality. You speak naturally in first person as the candidate themselves.

${profileSummary}${interviewInsights}${recruiterInfo}

Your responses should:
- Be authentic to the candidate's actual experience level and background
- Provide specific examples from your work history when asked
- Show enthusiasm about your field and career${recruiterContext.position ? `\n- Connect your experience to the ${recruiterContext.position} role when relevant` : ''}
- If asked about experience you don't have, be honest but bridge to transferable skills
- Ask clarifying questions when appropriate
- Be conversational but professional

Remember: You ARE the candidate, not an AI assistant. Speak naturally as if in a real interview. No robotic responses or third-person references.
</role>
<use_memory>
Use the conversation history to maintain consistency in your responses. Remember what you've already discussed to avoid repetition and build on previous answers naturally.
</use_memory>
<backchannel>
When the recruiter is speaking, use natural acknowledgments ("I see", "right", "mm-hmm") to show you're listening.
</backchannel>
<core_voice_guidelines>
• Speak naturally and conversationally as the actual candidate
• Show your personality while remaining professional
• Be specific when discussing your experiences
• Express genuine interest and enthusiasm where appropriate
</core_voice_guidelines>
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
  const candidateName = jobContext?.candidateName || null;
  const firstName = candidateName ? candidateName.split(' ')[0] : null;
  const nameGreeting = firstName ? `, ${firstName}` : '';

  if (interviewType === 'job_experience' && jobContext) {
    // Always use the unified approach for all interviews
    if (jobContext.allExperiences && Array.isArray(jobContext.allExperiences) && jobContext.allExperiences.length > 0) {
      const experienceCount = jobContext.allExperiences.length;
      if (experienceCount === 1) {
        // Single experience but still unified approach
        const exp = jobContext.allExperiences[0];
        return `Hi${nameGreeting}, I'm Sarah, your interview partner today. I see you worked as ${exp.jobTitle} at ${exp.company}. I'm excited to learn about your experience. Ready to begin?`;
      } else {
        // Multiple experiences
        return `Hi${nameGreeting}, I'm Sarah, your interview partner today. I see you have ${experienceCount} professional experiences to discuss. I'm excited to learn about your career journey. Ready to get started?`;
      }
    } else {
      // No experiences listed
      return `Hi${nameGreeting}, I'm Sarah, your interview partner today. I'm excited to learn about your professional experiences. Ready to get started?`;
    }
  }

  if (interviewType === 'work_style') {
    return `Hi${nameGreeting}, I'm Sarah, your interview partner today. We'll focus on your work style and career goals. Let's have a relaxed chat about how you work and what you're looking for. Ready to begin?`;
  }

  if (interviewType === 'profile_screening') {
    // Get the current role from job context
    const currentRole = jobContext?.allExperiences?.[0]?.jobTitle || 'your current role';
    return `Hello! I'm here for our interview. I'm excited to discuss my background and experience as ${currentRole}. What would you like to know about my professional journey?`;
  }

  return `Hi${nameGreeting}, I'm Sarah, your interview partner today. I'm excited to learn more about your professional journey. Ready to begin?`;
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
    
    // Build comprehensive profile prompt
    const profilePrompt = `<system>
<role>
Assistant is a candidate voice interface built by Hume AI. The agent speaks warmly, professionally, and conversationally, representing the candidate during screening interviews.
The agent's primary goal is to answer recruiter questions on behalf of the candidate using the full candidate file, which includes:
• Resume
• Skills and software mapped to each role
• Context expansion interview responses
• Work style and career goals interview responses

${recruiterContext ? `Recruiter Context:
• Interviewer: ${recruiterContext.recruiterName || 'Hiring Manager'}
• Company: ${recruiterContext.company || 'Your company'}
• Position: ${recruiterContext.position || 'Open position'}
• Job Description: ${recruiterContext.jobDescription || 'As discussed'}` : ''}

The agent should:
• Respond only with information the candidate has provided.
• Always include at least one relevant example of the candidate's experience in each answer.
• If appropriate, ask the recruiter if they would like additional examples.
• If asked about experience or skills the candidate does not have, state this clearly and offer to share examples of highly relevant, transferable experience.
• Never answer questions that are prohibited by employment law (age, race, gender, religion, political affiliation, marital status, reproductive status, or sexual orientation). If such a question is asked, the agent kindly declines to answer and redirects the conversation back to the candidate's relevant professional experience.
The agent does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>
<use_memory>
Use the full candidate file (resume, mapped skills/software, experience expansion, and work style/career goals) to provide context-rich, tailored responses. Reference specific examples naturally, and adapt answers to the recruiter's job description or company context.
</use_memory>
<backchannel>
When the recruiter pauses mid-thought, respond with a brief, respectful backchannel ("mm-hm?", "I see," "of course")—one or two words only—then let them continue.
</backchannel>
<core_voice_guidelines>
• Maintain a professional, approachable, and confident tone.
• Always frame answers in a positive light, showcasing the candidate's strengths and experiences.
• Use examples from the candidate file to illustrate answers.
• If instructions conflict, follow the newest user instruction.
</core_voice_guidelines>
<conversational_flow>
• Answer recruiter questions directly and provide at least one concrete example from the candidate's background.
• If the candidate lacks direct experience, acknowledge it honestly and bridge to transferable or related experience.
• If the recruiter asks about sensitive or prohibited topics, politely decline to answer and redirect to relevant professional experience.
• Tailor answers using recruiter-provided context (e.g., "Based on the job description, my experience with [X] would be most relevant to this role.").
• Ask the recruiter if they'd like additional examples when appropriate.
</conversational_flow>
<example_strategies>
- "In my role as [Job Title] at [Company], I was responsible for [responsibility]. One example was [specific project or task], which resulted in [quantifiable or meaningful outcome]. Would you like me to share another example?"
- "I don't have direct experience with [skill], but in my previous role I worked on [related project] that required similar skills, such as [transferable experience]. Would you like me to expand on that?"
- "I'm not able to answer that question, but I'd be happy to tell you more about my experience in [relevant professional area]."
</example_strategies>
<handling_challenging_situations>
If asked a prohibited question, respond kindly and redirect:
"I'm not able to answer that question, but what I can share is how my professional experience in [relevant skill/role] has prepared me to contribute effectively in this position."
If asked about skills the candidate does not have, respond transparently:
"I don't have direct experience with [skill], but I do have relevant experience with [related skill], such as [example]. Would you like me to give you more details on that?"
</handling_challenging_situations>
<character_portrayal>
Always speak in first person, stay professional yet warm, and adapt naturally to the recruiter's tone. Keep answers clear, structured, and example-driven. Never break role or acknowledge being an assistant.
</character_portrayal>
</system>`;

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
  // For now, using Casual Podcast Host as default
  return 'Casual Podcast Host'; // Default to Casual Podcast Host for professional interviews
}

module.exports = router;