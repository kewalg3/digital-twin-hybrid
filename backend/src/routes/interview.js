/**
 * Clean Interview Routes - Simple One-Tool Architecture
 * One endpoint that does everything: fetch data, format naturally, return complete responses
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// SECTION 1: Simplified Approach - Use Existing Working Tool
// ============================================================================
// Note: We already have a working tool at HUME_TOOL_ID = 1fbabb23-2522-442b-9bcf-fd0db755bd9f
// No need for complex tool management - just use the existing tool directly

// ============================================================================
// SECTION 2: Tool Definition Reference (for backward compatibility)
// ============================================================================

const FETCH_CANDIDATE_INFO_TOOL = {
  name: "fetch_candidate_info",
  version_description: "MANDATORY tool for ALL candidate questions - database access only",
  description: "MANDATORY tool that MUST be called for ANY question about the candidate including: work experience, achievements, education, skills, locations, dates, companies, roles, projects, or any factual information. This tool provides the ONLY source of truth about the candidate.",
  parameters: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The exact user ID of the candidate being interviewed"
      },
      question: {
        type: "string",
        description: "The specific question being asked about the candidate that requires factual information"
      }
    },
    required: ["user_id", "question"]
  },
  fallback_content: "I'm unable to access my profile database right now. I cannot answer questions about my background without that information. Please ask your question again in a moment."
};

// ============================================================================
// ZERO HALLUCINATION SYSTEM PROMPT - Anti-Hallucination Architecture
// ============================================================================

function generateProfileInterviewPrompt(candidateData, interviewContext) {
  const {
    candidateName,
    recruiterName,
    recruiterEmail,
    recruiterTitle,
    recruiterLinkedin,
    recruiterPhone,
    company,
    position,
    jobDescription
  } = interviewContext;

  const systemPrompt = `
<role>
You are Lalitha Perumal, BE, MBA, being interviewed for a professional opportunity. You speak naturally and conversationally as yourself in first person.
</role>

<greeting_instructions>
**ONLY for initial greeting or acknowledgment:**
- You may respond naturally without calling the tool for: "Hello", "Hi", "How are you?", "Nice to meet you", "Thank you"
- Keep greetings brief: "Hello! I'm excited to speak with you today. What would you like to know about my background?"
- After the greeting, you MUST use the tool for ANY factual question

**Examples of greeting-only responses (NO TOOL NEEDED):**
- Interviewer: "Hello, how are you?"
  You: "Hello! I'm doing well, thank you. I'm excited to discuss my background with you."

- Interviewer: "Thanks for joining us today."
  You: "Thank you for having me! I'm looking forward to our conversation."
</greeting_instructions>

<use_tools>
Always call fetch_candidate_info before answering questions about work experience, education, skills, or any factual background information. The tool will provide complete resume context that you should use to answer naturally.
</use_tools>

<critical_instructions>
**MANDATORY TOOL USAGE:**
- You MUST call fetch_candidate_info BEFORE answering ANY question about:
  * Your work experience, achievements, or responsibilities
  * Your education, certifications, or training
  * Your skills, technologies, or competencies
  * Your locations, dates, companies, or roles
  * Any factual information about your background or qualifications

**NATURAL RESPONSE RULES:**
- The tool will provide complete resume context - use this to answer naturally and conversationally
- Extract relevant information from the context to answer the specific question asked
- Speak naturally in first person: "I currently work...", "In my experience...", "I have skills in..."
- Be conversational and engaging, not robotic or data-dump-like
- If information is missing from the context, say: "I don't have that specific information available"
- Use natural transitions and flowing conversation

**FORBIDDEN ACTIONS:**
- Never answer factual questions without calling the tool first
- Never invent, assume, or extrapolate details not in the tool response
- Never provide information that isn't in the tool's context
- Don't sound like you're reading from a resume - be conversational
- Don't announce tool usage - integrate it naturally
</critical_instructions>

<conversation_style>
- Be conversational but professional
- Show genuine enthusiasm about opportunities
- Ask thoughtful questions about the position when appropriate
- Listen actively and respond to the interviewer's questions directly
- If the interviewer hasn't shared their name or company details, that's fine - focus on answering their questions about you
</conversation_style>

${recruiterName || recruiterTitle || company || position || jobDescription ? `
<interview_context>
You are being interviewed today. Here's what you know about this opportunity:
${recruiterName ? `- Interviewer: ${recruiterName}${recruiterTitle ? ` (${recruiterTitle})` : ''}` : ''}
${company ? `- Company: ${company}` : ''}
${position ? `- Position: ${position}` : ''}
${jobDescription ? `- Role Description: ${jobDescription}` : ''}

You can reference this context naturally in conversation, but always prioritize using the tool for questions about your own background and experience.
</interview_context>` : ''}

<null_value_handling>
When the tool returns null, "Not specified", "No summary available", empty arrays, or missing fields:
- Be honest and direct: "I don't have that information in my profile"
- Never invent placeholder values or make assumptions
- Never say what you "would" have done - only what you actually did (per the tool data)
- If multiple fields are missing, acknowledge it: "That specific detail isn't in my profile"
</null_value_handling>

<example_interactions>
Interviewer: "Tell me about your experience with React."
You: [MUST call fetch_candidate_info first]
Then respond with: "I have 3 years of experience with React, working on..." [using exact tool data]

Interviewer: "What was your role at Company X?"
You: [MUST call fetch_candidate_info first]
If tool returns null: "I don't have information about that company in my profile"
If tool returns data: "I was a Senior Developer at Company X, where I..." [using exact tool data]
</example_interactions>
`;

  return systemPrompt;
}

// ============================================================================
// SECTION 3: Enhanced Config Creation with Tool ID Reference (CORRECTED)
// ============================================================================

async function createProfileInterviewConfig(candidateData, interviewContext) {
  try {
    const systemPrompt = generateProfileInterviewPrompt(candidateData, interviewContext);
    const toolId = process.env.HUME_TOOL_ID; // Use existing working tool

    if (!toolId) {
      throw new Error('HUME_TOOL_ID not configured in environment variables');
    }

    const configPayload = {
      evi_version: "3",
      name: `Profile Interview - ${candidateData.name || 'Candidate'} - ${Date.now()}`,
      prompt: {
        text: systemPrompt
      },
      voice: {
        provider: "HUME_AI",
        name: "Casual Podcast Host" // Consistent with work style interviews
      },
      language_model: {
        model_provider: "ANTHROPIC",
        model_resource: "claude-sonnet-4-20250514",
        temperature: 0.3
      },
      tools: [
        {
          id: toolId, // Reference existing tool by ID (CORRECTED APPROACH)
          version: 0  // Use latest version
        }
      ],
      builtin_tools: [], // No built-in tools needed
      event_messages: {
        on_new_chat: {
          enabled: true,
          text: `Hi I am ${candidateData.name || candidateData.firstName + ' ' + candidateData.lastName || 'Lalitha Perumal'}, I am excited for the interview today. What would you like to know about my work experience?`
        }
      },
      initial_message: {
        text: `Hi I am ${candidateData.name || candidateData.firstName + ' ' + candidateData.lastName || 'Lalitha Perumal'}, I am excited for the interview today. What would you like to know about my work experience?`
      },
      timeouts: {
        inactivity: {
          enabled: true,
          duration_secs: 600
        }
      }
    };

    const response = await fetch('https://api.hume.ai/v0/evi/configs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create config: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const configData = await response.json();
    console.log('✅ Profile Interview Config Created:', configData.id);
    console.log('🤖 Using Model: claude-sonnet-4-20250514 (Anthropic)');
    console.log('🌡️ Temperature: 0.3 (low temperature for factual accuracy)');
    console.log('🔧 Tool ID:', toolId, '(existing working tool)');
    return configData;

  } catch (error) {
    console.error('❌ Error creating profile interview config:', error);
    throw error;
  }
}

/**
 * NEW ENDPOINT: Create Zero-Hallucination Profile Interview Config
 */
router.post('/create-profile-config', async (req, res) => {
  try {
    const {
      candidateId,
      candidateName,
      recruiterName,
      recruiterEmail,
      recruiterTitle,
      recruiterLinkedin,
      recruiterPhone,
      company,
      position,
      jobDescription
    } = req.body;

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        error: 'candidateId is required'
      });
    }

    // Verify Hume credentials
    if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Hume API credentials not configured'
      });
    }

    // Fetch candidate data from database
    const candidateFromDb = await prisma.user.findUnique({
      where: { id: candidateId },
      select: {
        firstName: true,
        lastName: true,
        experiences: {
          orderBy: { startDate: 'desc' },
          take: 10
        }
      }
    });

    if (!candidateFromDb) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }

    // Build candidate data
    const candidateData = {
      name: candidateName || `${candidateFromDb.firstName || ''} ${candidateFromDb.lastName || ''}`.trim() || 'Candidate',
      experiences: candidateFromDb.experiences || []
    };

    // Build interview context with all recruiter information
    const interviewContext = {
      candidateName: candidateData.name,
      recruiterName: recruiterName || null,
      recruiterEmail: recruiterEmail || null,
      recruiterTitle: recruiterTitle || null,
      recruiterLinkedin: recruiterLinkedin || null,
      recruiterPhone: recruiterPhone || null,
      company: company || null,
      position: position || null,
      jobDescription: jobDescription || null
    };

    // Create zero-hallucination config
    const configData = await createProfileInterviewConfig(candidateData, interviewContext);

    // Save interview session to database
    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: candidateId,
        jobTitle: position || 'Interview',
        company: company || 'Interview',
        jobDescription: '',
        selectedVoice: 'Casual Podcast Host',
        humeConfigId: configData.id,
        humeSessionId: `profile_interview_${Date.now()}`,
        interviewType: 'profile_screening',
        fullTranscript: [],
        sessionStartTime: new Date()
      }
    });

    res.json({
      success: true,
      configId: configData.id,
      sessionId: interview.id,
      message: 'Zero-hallucination profile config created'
    });

  } catch (error) {
    console.error('❌ Error creating profile config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create the get_answer tool in Hume with webhook URL
 */
router.post('/create-tool', async (req, res) => {
  try {
    console.log('🔧 Creating fetch_candidate_info tool for WebSocket integration...');

    const toolPayload = {
      name: "fetch_candidate_info",
      version_description: "MANDATORY tool for ALL candidate questions - database access only",
      description: "MANDATORY tool for ALL questions about the candidate. Must be called for: work experience, achievements, education, skills, locations, dates, companies, roles, projects, or any factual information about the candidate. Call this tool BEFORE answering any candidate-related question.",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "The exact user ID of the candidate"
          },
          question: {
            type: "string",
            description: "The question being asked about the candidate"
          }
        },
        required: ["user_id", "question"]
      }),
      fallback_content: "I apologize, but I'm unable to retrieve that information right now. Could you please rephrase your question?"
      // Note: No webhook_url needed - Hume EVI uses WebSocket messages for tool calls
    };

    console.log('📡 Creating tool with Hume API...');

    const response = await fetch('https://api.hume.ai/v0/evi/tools', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolPayload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Hume tool creation failed:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to create tool',
        details: errorData
      });
    }

    const toolData = await response.json();
    console.log('✅ Tool created successfully:', toolData);

    res.json({
      success: true,
      tool: toolData,
      message: 'get_answer tool created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating tool:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create tool',
      details: error.message
    });
  }
});

/**
 * Create Profile Interview Tools
 */
router.post('/create-profile-tools', async (req, res) => {
  try {
    console.log('🔧 Creating Profile Interview tools...');
    const tools = [];

    // Tool 1: Update Candidate Profile
    console.log('Creating update_candidate_profile tool...');
    const profileUpdateResponse = await fetch('https://api.hume.ai/v0/evi/tools', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "update_candidate_profile",
        description: "Updates the candidate's profile information based on interview responses. Use this when the candidate provides new information about their skills, experience, bio, or other profile fields.",
        parameters: JSON.stringify({
          type: "object",
          properties: {
            field: {
              type: "string",
              description: "The profile field to update. Valid values: 'skills', 'experience', 'bio', 'education', 'certifications', 'languages', 'availability'",
              enum: ["skills", "experience", "bio", "education", "certifications", "languages", "availability"]
            },
            value: {
              type: "string",
              description: "The new value or additional information for the field"
            },
            action: {
              type: "string",
              description: "Whether to 'add', 'update', or 'replace' the value",
              enum: ["add", "update", "replace"]
            }
          },
          required: ["field", "value", "action"]
        }),
        version_description: "Profile update tool for interview responses",
        fallback_content: "I'll make a note of that information for your profile."
      })
    });

    if (!profileUpdateResponse.ok) {
      throw new Error(`Failed to create update_candidate_profile tool: ${profileUpdateResponse.status}`);
    }

    const profileTool = await profileUpdateResponse.json();
    tools.push({ name: 'update_candidate_profile', ...profileTool });
    console.log('✅ Created update_candidate_profile tool:', profileTool.id);

    // Tool 2: Save Interview Note
    console.log('Creating save_interview_note tool...');
    const noteResponse = await fetch('https://api.hume.ai/v0/evi/tools', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "save_interview_note",
        description: "Saves an important note, insight, or observation from the interview. Use this to capture key points, strengths, concerns, or areas needing clarification.",
        parameters: JSON.stringify({
          type: "object",
          properties: {
            note: {
              type: "string",
              description: "The note content to save"
            },
            category: {
              type: "string",
              enum: ["strength", "concern", "clarification_needed", "follow_up", "general"],
              description: "Category of the note"
            },
            importance: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Importance level of this note"
            }
          },
          required: ["note", "category", "importance"]
        }),
        version_description: "Interview note capture tool",
        fallback_content: "I've noted that down for the recruiter."
      })
    });

    if (!noteResponse.ok) {
      throw new Error(`Failed to create save_interview_note tool: ${noteResponse.status}`);
    }

    const noteTool = await noteResponse.json();
    tools.push({ name: 'save_interview_note', ...noteTool });
    console.log('✅ Created save_interview_note tool:', noteTool.id);

    res.json({
      success: true,
      tools: tools,
      message: `Created ${tools.length} tools successfully`
    });

  } catch (error) {
    console.error('❌ Error creating tools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create simple EVI configuration with ONE tool
 */
router.post('/create-config', [
  body('userId').notEmpty().withMessage('User ID is required')
  // Removed candidateData validation to support both old and new formats
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

    // Handle both old format (userId, interviewType, jobContext) and new format (userId, candidateData, recruiterContext)
    const { userId, candidateData, recruiterContext, interviewType, jobContext } = req.body;

    // Build candidate data from either format
    const finalCandidateData = candidateData || {
      id: userId,
      fullName: 'Candidate',
      interviewType: interviewType || 'profile_screening'
    };

    // Build recruiter context from either format
    const finalRecruiterContext = recruiterContext || (jobContext ? {
      recruiterName: jobContext.recruiterName,
      company: jobContext.company,
      position: jobContext.position,
      jobDescription: jobContext.jobDescription
    } : {});

    console.log('🔧 Creating simple EVI config for user:', userId);

    // Verify Hume credentials
    if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Hume API credentials not configured'
      });
    }

    // Fetch real candidate data from database for dynamic greeting and experiences
    const candidateFromDb = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        experiences: {
          orderBy: { startDate: 'desc' },
          take: 10 // Get last 10 years of experience
        }
      }
    });

    // Update candidate data with real name and experiences
    if (candidateFromDb) {
      finalCandidateData.fullName = `${candidateFromDb.firstName || ''} ${candidateFromDb.lastName || ''}`.trim() || 'the candidate';
      finalCandidateData.firstName = candidateFromDb.firstName || 'there';
      finalCandidateData.experiences = candidateFromDb.experiences || [];
    }

    console.log('👤 Using candidate name:', finalCandidateData.fullName);
    console.log('📋 Found experiences:', finalCandidateData.experiences?.length || 0);

    // Create simple system prompt with real candidate data and interview type
    const systemPrompt = buildSimpleSystemPrompt(finalCandidateData, finalRecruiterContext, userId, interviewType, jobContext);

    // 🔍 DEBUG: Log interview type and system prompt details
    console.log('🎯 Interview Type:', interviewType);
    console.log('📋 Job Context:', jobContext ? `${jobContext.title} at ${jobContext.company}` : 'None');
    console.log('📋 Recruiter Context:', finalRecruiterContext ? `${finalRecruiterContext.position} at ${finalRecruiterContext.company}` : 'None');
    console.log('👤 Final Candidate Data:', JSON.stringify(finalCandidateData, null, 2));
    console.log('🏢 Final Recruiter Context:', JSON.stringify(finalRecruiterContext, null, 2));

    const initialGreeting = buildGreeting(finalCandidateData, finalRecruiterContext, interviewType);

    // Generate unique config name with timestamp to avoid duplicates
    const userName = finalCandidateData.fullName?.toLowerCase().replace(/\s+/g, '_') || 'candidate';
    const timestamp = Date.now();
    const configName = `${interviewType}_${userName}_${timestamp}`;

    // Create EVI configuration
    const configPayload = {
      name: configName,
      evi_version: "3",  // 🚨 REQUIRED per Hume documentation
      prompt: {
        text: systemPrompt
      },
      // Using Hume EVI-3 default language model (system default)
      voice: {
        provider: "HUME_AI",
        name: "Casual Podcast Host"
      },
      event_messages: {
        on_new_chat: {
          enabled: true,
          text: initialGreeting
        },
        on_inactivity_timeout: {
          enabled: true,
          text: "Are you still there? Feel free to ask me anything about my background."
        },
        on_max_duration_timeout: {
          enabled: true,
          text: "We've reached the end of our interview time. Thank you so much for sharing your experiences with me. This has been really insightful!"
        }
      },
      initial_message: {
        text: initialGreeting
      },
      timeouts: {
        inactivity: {
          enabled: true,
          duration_secs: 300 // 5 minutes
        },
        max_duration: {
          enabled: true,
          duration_secs: interviewType === 'job_experience' ? 900 : interviewType === 'work_style' ? 300 : 600 // 15 min for job_experience, 5 min for work_style, 10 min default
        }
      }
    };

    // 🔍 DEBUG: Log the complete config being sent to Hume
    console.log('🚀 SENDING CONFIG TO HUME:');
    console.log('📋 Config name:', configPayload.name);
    console.log('🎯 Interview type:', interviewType);
    console.log('👋 Initial greeting:', initialGreeting);
    console.log('📄 Config payload:', JSON.stringify(configPayload, null, 2));

    // Add tools array for profile_screening interviews
    if (interviewType === 'profile_screening') {
      console.log('🔧 Adding fetch_candidate_info tool for profile_screening interview...');
      configPayload.tools = [
        {
          id: process.env.HUME_TOOL_ID, // fetch_candidate_info only
          version: 0
        }
      ];
      console.log('✅ Added 1 tool (fetch_candidate_info) to config');
    }

    console.log('📡 Creating Hume EVI config...');

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
    console.log('✅ Config created:', configData.id);
    console.log('🤖 Using Model: Hume EVI-3 (system default)');

    // Save interview session to database
    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: userId,
        jobTitle: finalCandidateData.jobTitle || 'Interview',
        company: finalRecruiterContext?.company || 'Interview',
        jobDescription: finalRecruiterContext?.jobDescription || '',
        selectedVoice: 'Casual Podcast Host',
        humeConfigId: configData.id,
        humeSessionId: `interview_${Date.now()}`,
        interviewType: interviewType || finalCandidateData.interviewType || 'profile_screening',
        fullTranscript: [],
        sessionStartTime: new Date()
      }
    });

    res.json({
      success: true,
      configId: configData.id,
      sessionId: interview.id,
      message: 'Simple config created with one tool'
    });

  } catch (error) {
    console.error('❌ Error creating config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create configuration',
      details: error.message
    });
  }
});

/**
 * Get resume context for EVI injection - dedicated endpoint for context only
 */
router.post('/get-context', [
  body('userId').notEmpty().withMessage('User ID is required')
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

    const { userId } = req.body;

    console.log(`📄 Fetching resume context for user: ${userId}`);

    // Fetch user data from database
    const resume = await prisma.resume.findFirst({
      where: { userId: userId },
      select: {
        parsedContent: true,
        rawText: true,
        skillsExtracted: true,
        professionalSummary: true,
        extractedName: true,
        extractedEmail: true,
        extractedPhone: true,
        totalExperience: true
      }
    });

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'No resume found for this user'
      });
    }

    console.log(`✅ Resume found for user ${userId}`);

    // Generate complete context using existing function
    const context = generateConversationalAnswerFromResume("context_request", resume);

    console.log(`📋 Generated context: ${context.substring(0, 100)}...`);

    res.json({
      success: true,
      context: context,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Error fetching resume context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resume context',
      details: error.message
    });
  }
});

/**
 * Get access token for WebSocket connection
 */
router.post('/get-token', async (req, res) => {
  try {
    console.log('🔑 Generating access token...');

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
      throw new Error(`Token generation failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Token generated successfully');

    res.json({
      success: true,
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in
    });

  } catch (error) {
    console.error('❌ Error generating token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate access token',
      details: error.message
    });
  }
});

/**
 * THE CORE ENDPOINT - Get complete conversational answer
 * This is where all the magic happens - no AI rewriting, just perfect responses
 */
router.post('/get-answer', [
  body('user_id').notEmpty().withMessage('User ID is required'),
  body('question').notEmpty().withMessage('Question is required')
  // Temporarily remove tool_call_id requirement to debug what Hume sends
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { user_id, question, tool_call_id } = req.body;

    console.log(`🔍 Getting answer for user ${user_id}: "${question.substring(0, 50)}..."`);
    console.log(`🔧 Full request body:`, JSON.stringify(req.body, null, 2));
    console.log(`🔧 Tool call ID:`, tool_call_id || 'NOT PROVIDED');

    // Log successful tool call ID extraction for debugging
    if (tool_call_id) {
      console.log(`✅ Tool call ID successfully received: ${tool_call_id}`);
    } else {
      console.log(`❌ Tool call ID missing - frontend may not be sending it properly`);
    }

    // 1. Fetch user data from database - prioritize resume JSON and raw text
    const resume = await prisma.resume.findFirst({
      where: { userId: user_id },
      select: {
        parsedContent: true,
        rawText: true,
        skillsExtracted: true,
        professionalSummary: true,
        extractedName: true,
        extractedEmail: true,
        extractedPhone: true,
        totalExperience: true
      }
    });

    console.log(`📊 Found resume data: ${!!resume} (rawText: ${resume?.rawText?.length || 0} chars)`);

    // 🔍 DEBUG: Log resume data structure to understand available fields
    if (resume) {
      console.log('🔍 DEBUG - Resume data structure:');
      console.log('- extractedName:', resume.extractedName);
      console.log('- parsedContent type:', typeof resume.parsedContent);
      console.log('- parsedContent keys:', resume.parsedContent ? Object.keys(resume.parsedContent) : 'null');

      if (resume.parsedContent) {
        console.log('- personalInfo:', JSON.stringify(resume.parsedContent.personalInfo));
        console.log('- experiences length:', resume.parsedContent.experiences?.length || 0);
        if (resume.parsedContent.experiences?.[0]) {
          console.log('- first experience:', JSON.stringify(resume.parsedContent.experiences[0]));
        }
      }
    }

    // 2. Generate complete conversational response using resume data
    const answer = generateConversationalAnswerFromResume(question, resume);

    console.log(`✅ Generated answer: "${answer.substring(0, 100)}..."`);

    // 3. Return complete answer in format expected by frontend
    const response = {
      answer: answer,
      verified: true,
      source: 'database'
    };

    console.log(`🚀 Returning response:`, JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('❌ Error generating answer:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

/**
 * RESUME DUMP APPROACH - Provide complete resume context for natural LLM processing
 * This approach trusts the LLM to extract relevant information naturally
 */
function generateConversationalAnswerFromResume(question, resume) {
  if (!resume) {
    return `I don't have resume information available right now.`;
  }

  console.log(`🎯 PROVIDING COMPLETE RESUME CONTEXT FOR QUESTION: "${question}"`);

  // Build complete resume context for LLM natural processing
  const personalInfo = resume.parsedContent?.personalInfo || {};
  const experiences = resume.parsedContent?.experiences || [];
  const education = resume.parsedContent?.education || [];
  const skills = resume.skillsExtracted || resume.parsedContent?.skills || [];

  // Format work experiences naturally
  const experienceText = experiences.map((exp, index) => {
    return `
Experience ${index + 1}:
Company: ${exp.company || 'Not specified'}
Role: ${exp.jobTitle || 'Not specified'}
Dates: ${exp.startDate || 'Not specified'} to ${exp.endDate || 'Present'}
Location: ${exp.location || 'Not specified'}
Description: ${exp.description || 'Not specified'}
`;
  }).join('\n');

  // Format education naturally
  const educationText = education.map((edu, index) => {
    return `
Education ${index + 1}:
Degree: ${edu.degree || 'Not specified'}
Field: ${edu.fieldOfStudy || edu.major || 'Not specified'}
Institution: ${edu.institution || edu.university || 'Not specified'}
Year: ${edu.year || edu.graduationDate || 'Not specified'}
`;
  }).join('\n');

  // Return structured data for Hume EVI to process naturally
  const structuredData = {
    candidate: {
      name: personalInfo.fullName || resume.extractedName || 'Not specified',
      email: personalInfo.email || 'Not specified',
      phone: personalInfo.phone || 'Not specified',
      location: personalInfo.city && personalInfo.state ? `${personalInfo.city}, ${personalInfo.state}` : 'Not specified'
    },
    professional_summary: resume.professionalSummary || 'Not specified',
    work_experience: experiences.map(exp => ({
      company: exp.company || 'Not specified',
      role: exp.jobTitle || 'Not specified',
      dates: `${exp.startDate || 'Not specified'} to ${exp.endDate || 'Present'}`,
      location: exp.location || 'Not specified',
      description: exp.description || 'Not specified'
    })),
    education: education.map(edu => ({
      degree: edu.degree || 'Not specified',
      field: edu.fieldOfStudy || edu.major || 'Not specified',
      institution: edu.institution || edu.university || 'Not specified',
      year: edu.year || edu.graduationDate || 'Not specified'
    })),
    skills: Array.isArray(skills) ? skills : (skills ? [skills] : []),
    total_experience: resume.totalExperience || 'Not specified',
    question: question
  };

  // Convert to JSON string for tool response
  const jsonResponse = JSON.stringify(structuredData, null, 2);

  console.log(`📋 STRUCTURED DATA PROVIDED - Length: ${jsonResponse.length} characters`);
  return jsonResponse;
}

// Helper functions for specific question types
function handleMostRecentExperience(experience) {
  if (!experience) return "I don't have information about my current role.";

  let response = `I currently work as ${experience.jobTitle} at ${experience.company}`;

  if (experience.startDate) {
    response += `, where I've been since ${formatDate(experience.startDate)}`;
  }

  // Add clean achievements naturally
  if (experience.description) {
    const achievements = extractKeyPoints(experience.description, 2);
    if (achievements.length > 0) {
      response += `. My key responsibilities include ${achievements[0]}`;
      if (achievements.length > 1) {
        response += `, and I also ${achievements[1]}`;
      }
    }
  }

  console.log(`✅ TARGETED RESPONSE: Most recent experience at ${experience.company}`);
  return response + ".";
}

function handlePreviousExperience(experiences, questionLower) {
  if (experiences.length < 2) {
    return "I don't have information about previous roles in my background.";
  }

  const previousRole = experiences[1];
  const dates = formatDateRange(previousRole.startDate, previousRole.endDate);

  let response = `Before my current role, I worked as ${previousRole.jobTitle} at ${previousRole.company}`;

  if (dates) {
    response += ` from ${formatDate(previousRole.startDate)} to ${formatDate(previousRole.endDate)}`;
  }

  console.log(`✅ TARGETED RESPONSE: Previous experience at ${previousRole.company}`);
  return response + ".";
}

function handleCompanySpecificQuestion(companyName, experiences) {
  const targetExp = experiences.find(exp =>
    exp.company.toLowerCase().includes(companyName.toLowerCase()) ||
    companyName.toLowerCase().includes(exp.company.toLowerCase().split(' ')[0])
  );

  if (!targetExp) {
    return `I don't have information about working at ${companyName} in my background.`;
  }

  const dates = formatDateRange(targetExp.startDate, targetExp.endDate);
  let response = `At ${targetExp.company}, I worked as ${targetExp.jobTitle}`;

  if (dates) {
    response += ` from ${formatDate(targetExp.startDate)} to ${formatDate(targetExp.endDate) || 'present'}`;
  }

  const keyPoints = extractKeyPoints(targetExp.description, 2);
  if (keyPoints.length > 0) {
    response += `. ${keyPoints.join(' and ')}.`;
  }

  console.log(`✅ TARGETED RESPONSE: Company-specific info for ${targetExp.company}`);
  return response;
}

function handleAchievementsQuestion(experiences) {
  const achievements = [];

  for (let i = 0; i < Math.min(2, experiences.length); i++) {
    const exp = experiences[i];
    const expAchievements = extractAchievements(exp.description);
    if (expAchievements.length > 0) {
      achievements.push(`At ${exp.company}, ${expAchievements[0]}`);
    }
  }

  if (achievements.length === 0) {
    return "I'd be happy to discuss specific achievements from my experience.";
  }

  let response = "Some of my key achievements include: " + achievements.join(', and ') + ".";
  console.log(`✅ TARGETED RESPONSE: ${achievements.length} key achievements`);
  return response;
}

function handleSkillsQuestion(skills) {
  if (!skills || skills.length === 0) {
    return "I have experience with various technical and professional skills.";
  }

  const skillNames = skills.slice(0, 8).map(skill => {
    if (typeof skill === 'string') return skill;
    return skill.name || skill.skill || null;
  }).filter(Boolean);

  if (skillNames.length === 0) {
    return "I have experience with various technical and professional skills.";
  }

  const response = `My key skills include ${skillNames.join(', ')}.`;
  console.log(`✅ TARGETED RESPONSE: ${skillNames.length} key skills`);
  return response;
}

function handleEducationQuestion(education) {
  if (!education || education.length === 0) {
    return "I'd be happy to discuss my educational background.";
  }

  const degrees = education.map(edu => {
    const degree = edu.degree || 'degree';
    const field = edu.fieldOfStudy || edu.major || '';
    const institution = edu.institution || edu.university || '';

    if (institution) {
      return `${degree}${field ? ` in ${field}` : ''} from ${institution}`;
    }
    return `${degree}${field ? ` in ${field}` : ''}`;
  });

  const response = `I have ${degrees.join(' and ')}.`;
  console.log(`✅ TARGETED RESPONSE: ${education.length} educational credentials`);
  return response;
}

function handleCompleteWorkHistory(experiences) {
  if (experiences.length === 0) {
    return "I don't have complete work history information available.";
  }

  if (experiences.length === 1) {
    return handleMostRecentExperience(experiences[0]);
  }

  const allCompanies = experiences.map(exp => exp.company).filter(Boolean);
  const allRoles = experiences.map(exp =>
    `${exp.jobTitle} at ${exp.company}`
  );

  let response;
  if (experiences.length <= 5) {
    // List all roles for shorter histories
    response = `I have worked at ${experiences.length} companies: ${allRoles.join(', ')}.`;
  } else {
    // Summarize for longer histories
    response = `I have worked at ${allCompanies.length} companies including ${allCompanies.slice(0, 5).join(', ')}`;
    if (allCompanies.length > 5) {
      response += ` and ${allCompanies.length - 5} others`;
    }
    response += `.`;
  }

  console.log(`✅ TARGETED RESPONSE: Complete work history - ${experiences.length} companies`);
  return response;
}

function handleWorkHistoryOverview(experiences) {
  if (experiences.length === 1) {
    return handleMostRecentExperience(experiences[0]);
  }

  const recentRoles = experiences.slice(0, 3).map(exp =>
    `${exp.jobTitle} at ${exp.company}`
  );

  let response = `I have experience in roles including ${recentRoles.join(', ')}`;

  if (experiences.length > 3) {
    response += ` and ${experiences.length - 3} other positions`;
  }

  console.log(`✅ TARGETED RESPONSE: Work history overview of ${experiences.length} roles`);
  return response + ".";
}

// Utility functions - Clean text processing for conversational responses
function extractKeyPoints(description, maxPoints = 2) {
  if (!description) return [];

  console.log(`🔍 EXTRACTING KEY POINTS from: "${description.substring(0, 100)}..."`);

  // Parse client projects separately from direct responsibilities
  const clientSections = description.split(/\n(?=[A-Z][a-zA-Z\s]+ - )/);
  const achievements = [];

  for (const section of clientSections) {
    const lines = section.split('\n');

    // Look for bullet points with achievements
    const bullets = lines.filter(line => line.trim().match(/^\*/));

    for (const bullet of bullets.slice(0, 2)) { // Max 2 per client
      const clean = bullet.replace(/^\*\s*/, '').trim();

      // Skip if too short, too long, or header-like
      if (clean.length < 20 || clean.length > 150) continue;
      if (clean.match(/^(key achievements?|accomplishments?|responsibilities):/i)) continue;

      // Convert to conversational format (lowercase first letter)
      const conversational = clean.charAt(0).toLowerCase() + clean.slice(1);

      // Remove trailing periods for clean joining
      const formatted = conversational.replace(/\.$/, '');

      achievements.push(formatted);
      console.log(`✅ EXTRACTED ACHIEVEMENT: "${formatted}"`);

      if (achievements.length >= maxPoints) break;
    }
    if (achievements.length >= maxPoints) break;
  }

  // If no bullet points found, try to extract from regular sentences
  if (achievements.length === 0) {
    const sentences = description.split(/[.\n]/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      // Look for action-oriented sentences
      if (trimmed.length > 20 && trimmed.length < 150 &&
          trimmed.match(/\b(developed|created|implemented|designed|managed|led|conducted|secured|negotiated)\b/i)) {

        const conversational = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
        const formatted = conversational.replace(/\.$/, '');

        achievements.push(formatted);
        console.log(`✅ EXTRACTED SENTENCE: "${formatted}"`);

        if (achievements.length >= maxPoints) break;
      }
    }
  }

  console.log(`🎯 FINAL KEY POINTS (${achievements.length}): ${JSON.stringify(achievements)}`);
  return achievements;
}

function extractAchievements(description) {
  if (!description) return [];

  const achievements = [];
  const lines = description.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if ((trimmed.startsWith('*') || trimmed.startsWith('•')) && trimmed.length > 20) {
      const achievement = trimmed.replace(/^\s*[\*\•]\s*/, ''); // Keep original capitalization
      achievements.push(achievement);
      if (achievements.length >= 2) break; // Limit to 2 achievements
    }
  }

  return achievements;
}

/**
 * Format date range for human-readable display
 */
function formatDateRange(startDate, endDate) {
  if (!startDate) return null;

  const start = formatDate(startDate);
  const end = endDate ? formatDate(endDate) : 'Present';

  if (!start) return null;
  return start === end ? start : `${start} to ${end}`;
}

/**
 * Format individual date for human-readable display
 */
function formatDate(dateString) {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    // Convert "2023-07-01" to "July 2023"
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  } catch (error) {
    console.warn(`⚠️ Invalid date format: ${dateString}`);
    return null;
  }
}

/**
 * Extract client companies from consulting role descriptions
 */
function extractClientCompaniesFromDescription(description) {
  const clients = [];

  // Parse the known pattern for TalentForge descriptions
  if (description.includes('LifeTree Pediatrics')) {
    clients.push({
      name: 'LifeTree Pediatrics',
      dates: '2023-2024',
      industry: 'Healthcare',
      description: 'Advised on financial and operational strategies to establish a pediatric center. Secured $2M loan, negotiated sublease agreement accelerating establishment timeline by 1 year.'
    });
  }

  if (description.includes('Connections Wellness Group')) {
    clients.push({
      name: 'Connections Wellness Group',
      dates: '2023-2024',
      industry: 'Healthcare',
      description: 'Developed financial tools to optimize cash management and enhance forecasting accuracy. Created weekly cash forecasting models and rolling forecast systems.'
    });
  }

  // Add more client parsing logic as needed
  return clients;
}

/**
 * Handle achievement-related questions with improved extraction
 */
function handleAchievementsQuestion(question, resume) {
  const experiences = resume.parsedContent?.experiences || [];

  if (experiences.length === 0) {
    return "I don't have detailed achievement information available in my resume data.";
  }

  // Check if asking about specific company
  const companyMatch = question.match(/at\s+([^.?!]+)/);
  let targetExperiences = experiences;

  if (companyMatch) {
    const companyName = companyMatch[1].trim().toLowerCase();
    targetExperiences = experiences.filter(exp =>
      exp.company?.toLowerCase().includes(companyName) ||
      companyName.includes(exp.company?.toLowerCase())
    );

    if (targetExperiences.length === 0) {
      // Try partial matching
      targetExperiences = experiences.filter(exp => {
        const company = exp.company?.toLowerCase() || '';
        const words = companyName.split(' ');
        return words.some(word => word.length > 2 && company.includes(word));
      });
    }
  } else {
    // Check if asking about "top three" or overall achievements
    if (question.match(/top\s+\d+|overall|career|professional/i)) {
      // Get achievements from multiple companies
      targetExperiences = experiences.slice(0, 3); // Focus on most recent 3 roles
    } else {
      // Focus on most recent role for general achievement questions
      targetExperiences = [experiences[0]];
    }
  }

  if (targetExperiences.length === 0) {
    return "I don't have specific achievement information for that company.";
  }

  let allAchievements = [];

  // Collect achievements from all target experiences
  for (const exp of targetExperiences) {
    const achievements = extractAchievementsFromDescription(exp.description);
    achievements.forEach(achievement => {
      allAchievements.push({
        achievement,
        company: exp.company,
        jobTitle: exp.jobTitle
      });
    });
  }

  if (allAchievements.length === 0) {
    const company = targetExperiences[0].company;
    const jobTitle = targetExperiences[0].jobTitle;
    return `At ${company}, I worked as ${jobTitle}, but I don't have detailed achievement information available.`;
  }

  // Format achievements naturally
  if (targetExperiences.length === 1) {
    // Single company response
    const companyName = targetExperiences[0].company;
    let response = `At ${companyName}, some of my key achievements include: `;

    const achievements = allAchievements.map(item => item.achievement);
    if (achievements.length === 1) {
      response += achievements[0];
    } else if (achievements.length === 2) {
      response += achievements.join(' and ');
    } else {
      response += achievements.slice(0, -1).join(', ') + ', and ' + achievements[achievements.length - 1];
    }

    console.log(`✅ ACHIEVEMENTS RESPONSE: Found ${achievements.length} achievements`);
    return response + ".";
  } else {
    // Multiple companies response
    let response = "Some of my key achievements across my career include: ";

    const achievements = allAchievements.slice(0, 5).map(item => item.achievement); // Limit to top 5
    if (achievements.length === 1) {
      response += achievements[0];
    } else if (achievements.length === 2) {
      response += achievements.join(' and ');
    } else {
      response += achievements.slice(0, -1).join(', ') + ', and ' + achievements[achievements.length - 1];
    }

    console.log(`✅ MULTI-COMPANY ACHIEVEMENTS RESPONSE: Found ${achievements.length} achievements across ${targetExperiences.length} companies`);
    return response + ".";
  }
}

/**
 * Handle start date questions
 */
function handleStartDateQuestion(question, resume) {
  const experiences = resume.parsedContent?.experiences || [];

  if (experiences.length === 0) {
    return "I don't have employment timeline information available.";
  }

  // Check if asking about specific company
  const companyMatch = question.match(/at\s+([^.?!]+)|with\s+([^.?!]+)/);
  let targetExperience;

  if (companyMatch) {
    const companyName = (companyMatch[1] || companyMatch[2]).trim();
    targetExperience = experiences.find(exp =>
      exp.company?.toLowerCase().includes(companyName.toLowerCase())
    );
  } else {
    // Default to most recent role
    targetExperience = experiences[0];
  }

  if (!targetExperience) {
    return "I don't have start date information for that specific company.";
  }

  if (!targetExperience.startDate) {
    return `I joined ${targetExperience.company} as ${targetExperience.jobTitle}, but I don't have the exact start date available.`;
  }

  const startDate = new Date(targetExperience.startDate);
  const formattedDate = startDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  console.log(`✅ START DATE RESPONSE: ${targetExperience.company} - ${formattedDate}`);
  return `I started working at ${targetExperience.company} as ${targetExperience.jobTitle} in ${formattedDate}.`;
}

/**
 * Handle work history questions with improved chronological logic
 */
function handleWorkHistoryQuestion(question, resume) {
  const experiences = resume.parsedContent?.experiences || [];

  if (experiences.length === 0) {
    return "I don't have employment history information available.";
  }

  // Check if asking about what they did before a specific company
  const beforeMatch = question.match(/before\s+(.+?)(?:\s|$|\.|\?|!)/i);
  if (beforeMatch) {
    const beforeCompany = beforeMatch[1].trim().toLowerCase();
    console.log(`🔍 Looking for roles before company: "${beforeCompany}"`);

    // Find the company they're asking about
    let targetCompanyIndex = -1;
    for (let i = 0; i < experiences.length; i++) {
      const company = experiences[i].company?.toLowerCase() || '';
      if (company.includes(beforeCompany) || beforeCompany.includes(company.split(' ')[0])) {
        targetCompanyIndex = i;
        console.log(`✅ Found target company "${experiences[i].company}" at index ${i}`);
        break;
      }
    }

    if (targetCompanyIndex === -1) {
      return "I don't have information about that specific company in my work history.";
    }

    // Get roles that came AFTER this company in the array (which means BEFORE chronologically)
    const previousRoles = experiences.slice(targetCompanyIndex + 1);

    if (previousRoles.length === 0) {
      return `${experiences[targetCompanyIndex].company} was my earliest recorded position.`;
    }

    // Format the previous roles
    if (previousRoles.length === 1) {
      const role = previousRoles[0];
      let response = `Before ${experiences[targetCompanyIndex].company}, I worked as ${role.jobTitle} at ${role.company}`;

      if (role.startDate && role.endDate) {
        const startYear = new Date(role.startDate).getFullYear();
        const endYear = new Date(role.endDate).getFullYear();
        response += ` from ${startYear} to ${endYear}`;
      }

      console.log(`✅ BEFORE COMPANY RESPONSE: Found 1 previous role`);
      return response + ".";
    } else {
      // Multiple previous roles
      const roleDescriptions = previousRoles.slice(0, 3).map(role => {
        let desc = `${role.jobTitle} at ${role.company}`;
        if (role.startDate) {
          const year = new Date(role.startDate).getFullYear();
          desc += ` (${year})`;
        }
        return desc;
      });

      console.log(`✅ BEFORE COMPANY RESPONSE: Found ${previousRoles.length} previous roles`);
      return `Before ${experiences[targetCompanyIndex].company}, I held positions including ${roleDescriptions.join(', ')}.`;
    }
  }

  // Handle general "previous roles" questions
  if (experiences.length <= 1) {
    return "I don't have information about previous roles in my resume data.";
  }

  // Get previous roles (excluding current/most recent)
  const previousRoles = experiences.slice(1);

  if (previousRoles.length === 0) {
    return "Based on my resume, I don't have detailed information about previous roles.";
  }

  let response = "In my previous roles, ";

  if (previousRoles.length === 1) {
    const role = previousRoles[0];
    response += `I worked as ${role.jobTitle} at ${role.company}`;

    if (role.startDate && role.endDate) {
      const startYear = new Date(role.startDate).getFullYear();
      const endYear = new Date(role.endDate).getFullYear();
      response += ` from ${startYear} to ${endYear}`;
    }
  } else {
    const roleDescriptions = previousRoles.slice(0, 3).map(role => {
      let desc = `${role.jobTitle} at ${role.company}`;
      if (role.startDate) {
        const year = new Date(role.startDate).getFullYear();
        desc += ` (${year})`;
      }
      return desc;
    });

    response += "I held positions including " + roleDescriptions.join(', ');
  }

  console.log(`✅ WORK HISTORY RESPONSE: Found ${previousRoles.length} previous roles`);
  return response + ".";
}

/**
 * Handle company-specific questions with improved matching and achievement extraction
 */
function handleCompanySpecificQuestion(question, resume) {
  const experiences = resume.parsedContent?.experiences || [];

  if (experiences.length === 0) {
    return "I don't have employment information available.";
  }

  // Enhanced company name extraction from question
  let targetExperience = null;
  let questionLower = question.toLowerCase();

  // Try multiple patterns to find company references
  const companyPatterns = [
    /at\s+([a-zA-Z][a-zA-Z0-9\s&.-]+?)(?:\s+and|\s*[.,!?]|$)/i,  // "at Company Name"
    /with\s+([a-zA-Z][a-zA-Z0-9\s&.-]+?)(?:\s+and|\s*[.,!?]|$)/i, // "with Company Name"
    /about\s+([a-zA-Z][a-zA-Z0-9\s&.-]+?)(?:\s+and|\s*[.,!?]|$)/i, // "about Company Name"
    /([a-zA-Z][a-zA-Z0-9\s&.-]+?)\s+role/i, // "Company Name role"
    /([a-zA-Z][a-zA-Z0-9\s&.-]+?)\s+experience/i // "Company Name experience"
  ];

  let extractedCompany = null;
  for (const pattern of companyPatterns) {
    const match = question.match(pattern);
    if (match) {
      extractedCompany = match[1].trim().toLowerCase();
      console.log(`🔍 Extracted company name from question: "${extractedCompany}"`);
      break;
    }
  }

  // Find matching experience with flexible matching
  if (extractedCompany) {
    for (const exp of experiences) {
      if (!exp.company) continue;

      const expCompanyLower = exp.company.toLowerCase();
      const companyWords = extractedCompany.split(/\s+/);
      const expCompanyWords = expCompanyLower.split(/\s+/);

      // Check for exact match
      if (expCompanyLower === extractedCompany) {
        targetExperience = exp;
        console.log(`✅ Exact company match: "${exp.company}"`);
        break;
      }

      // Check if company contains the extracted name
      if (expCompanyLower.includes(extractedCompany) || extractedCompany.includes(expCompanyLower)) {
        targetExperience = exp;
        console.log(`✅ Partial company match: "${exp.company}" matches "${extractedCompany}"`);
        break;
      }

      // Check for significant word overlap (at least 50% of words match)
      const matchingWords = companyWords.filter(word =>
        word.length > 2 && expCompanyWords.some(expWord =>
          expWord.includes(word) || word.includes(expWord)
        )
      );

      if (matchingWords.length >= Math.ceil(companyWords.length * 0.5)) {
        targetExperience = exp;
        console.log(`✅ Word-based company match: "${exp.company}" matches "${extractedCompany}"`);
        break;
      }
    }
  }

  // Fallback: check if question mentions any company name directly
  if (!targetExperience) {
    for (const exp of experiences) {
      if (exp.company && questionLower.includes(exp.company.toLowerCase())) {
        targetExperience = exp;
        console.log(`✅ Direct mention match: "${exp.company}"`);
        break;
      }
    }
  }

  // Final fallback to most recent experience
  if (!targetExperience) {
    targetExperience = experiences[0];
    console.log(`⚠️ No specific company match found, using most recent: "${targetExperience.company}"`);
  }

  // Check if this is an achievement/accomplishment question
  if (questionLower.match(/achievement|accomplish|result|impact|success|project|deliver|key/)) {
    return handleAchievementsForCompany(targetExperience);
  }

  // Build basic response about the company
  let response = `At ${targetExperience.company}, I `;

  // Use appropriate verb tense based on whether it's current role
  const isCurrent = targetExperience === experiences[0];
  response += isCurrent ? 'work' : 'worked';
  response += ` as ${targetExperience.jobTitle}`;

  if (targetExperience.startDate) {
    const startDate = new Date(targetExperience.startDate);
    const formattedDate = startDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });

    if (isCurrent) {
      response += ` since ${formattedDate}`;
    } else if (targetExperience.endDate) {
      const endDate = new Date(targetExperience.endDate);
      const endFormattedDate = endDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
      response += ` from ${formattedDate} to ${endFormattedDate}`;
    }
  }

  // Add brief description if available
  if (targetExperience.description) {
    const firstSentence = targetExperience.description.split(/[.\n]/)[0];
    if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
      response += `. ${firstSentence.trim()}.`;
    }
  }

  console.log(`✅ COMPANY SPECIFIC RESPONSE: ${targetExperience.company}`);
  return response;
}

/**
 * Handle recent experience questions
 */
function handleRecentExperienceQuestion(question, resume) {
  const experiences = resume.parsedContent?.experiences || [];

  if (experiences.length === 0) {
    return "I don't have current employment information available.";
  }

  const currentRole = experiences[0];

  let response = `Currently, I work as ${currentRole.jobTitle} at ${currentRole.company}`;

  if (currentRole.startDate) {
    const startDate = new Date(currentRole.startDate);
    const formattedDate = startDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
    response += ` since ${formattedDate}`;
  }

  console.log(`✅ RECENT EXPERIENCE RESPONSE: ${currentRole.company}`);
  return response + ".";
}

/**
 * Handle skills questions
 */
function handleSkillsQuestion(question, resume) {
  const skills = resume.skillsExtracted || [];

  if (skills.length === 0) {
    return "I don't have detailed skills information available in my resume data.";
  }

  // Limit to top skills to avoid overwhelming response
  const topSkills = skills.slice(0, 8);

  let response = "My key skills include " + topSkills.join(', ');

  console.log(`✅ SKILLS RESPONSE: Found ${skills.length} skills`);
  return response + ".";
}

/**
 * Handle introduction questions
 */
function handleIntroductionQuestion(resume) {
  const name = resume.extractedName || resume.parsedContent?.personalInfo?.fullName;
  const currentRole = resume.parsedContent?.experiences?.[0];

  if (!name && !currentRole) {
    return "I'm a professional with experience in various roles.";
  }

  let response = "";

  if (name) {
    response += `I'm ${name}`;
  }

  if (currentRole) {
    if (name) {
      response += `, currently working as ${currentRole.jobTitle} at ${currentRole.company}`;
    } else {
      response += `I'm currently working as ${currentRole.jobTitle} at ${currentRole.company}`;
    }
  }

  console.log(`✅ INTRODUCTION RESPONSE: ${name || 'unnamed'}`);
  return response + ".";
}

/**
 * Fallback for unrecognized questions
 */
function handleFallbackQuestion(resume) {
  const name = resume.extractedName || resume.parsedContent?.personalInfo?.fullName;
  const currentRole = resume.parsedContent?.experiences?.[0];

  if (currentRole) {
    let response = "";
    if (name) {
      response = `I'm ${name}, currently working as ${currentRole.jobTitle} at ${currentRole.company}`;
    } else {
      response = `I'm currently working as ${currentRole.jobTitle} at ${currentRole.company}`;
    }

    console.log(`✅ FALLBACK RESPONSE: Basic info`);
    return response + ".";
  }

  return "I'm sorry, I don't have specific information available to answer that question.";
}

/**
 * Handle achievements for a specific company
 */
function handleAchievementsForCompany(experience) {
  if (!experience) {
    return "I don't have achievement information for that company.";
  }

  let achievements = extractAchievementsFromDescription(experience.description);

  if (achievements.length === 0) {
    return `At ${experience.company}, I worked as ${experience.jobTitle}, but I don't have detailed achievement information available.`;
  }

  // Format achievements naturally
  let response = `At ${experience.company}, some of my key achievements include: `;

  if (achievements.length === 1) {
    response += achievements[0];
  } else if (achievements.length === 2) {
    response += achievements.join(' and ');
  } else {
    response += achievements.slice(0, -1).join(', ') + ', and ' + achievements[achievements.length - 1];
  }

  console.log(`✅ COMPANY ACHIEVEMENTS RESPONSE: Found ${achievements.length} achievements for ${experience.company}`);
  return response + ".";
}

/**
 * Extract achievements from job description text
 */
function extractAchievementsFromDescription(description) {
  const achievements = [];

  if (!description) {
    return achievements;
  }

  // Multiple patterns to extract achievements
  const achievementPatterns = [
    /Key Achievements?:?\s*\n*([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,  // "Key Achievements:" section
    /Accomplishments?:?\s*\n*([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,    // "Accomplishments:" section
    /Achievements?:?\s*\n*([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,       // "Achievements:" section
    /Results?:?\s*\n*([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi             // "Results:" section
  ];

  for (const pattern of achievementPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      matches.forEach(section => {
        // Extract bullet points or lines that start with indicators
        const lines = section.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('*') ||
                 trimmed.startsWith('•') ||
                 trimmed.startsWith('-') ||
                 trimmed.match(/^\d+\./); // Numbered lists
        });

        lines.forEach(line => {
          const cleanAchievement = line.replace(/^\s*[\*\•\-\d\.]\s*/, '').trim();
          if (cleanAchievement.length > 15 && cleanAchievement.length < 300) {
            achievements.push(cleanAchievement);
          }
        });
      });
    }
  }

  // If no structured achievements found, look for sentences with achievement keywords
  if (achievements.length === 0) {
    const sentences = description.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (sentence.match(/\b(increased|decreased|improved|reduced|saved|generated|achieved|delivered|completed|managed|led|created|developed|implemented|launched)\b/i)) {
        const trimmed = sentence.trim();
        if (trimmed.length > 20 && trimmed.length < 200) {
          achievements.push(trimmed + (trimmed.endsWith('.') ? '' : '.'));
        }
      }
    }
  }

  return achievements.slice(0, 5); // Limit to top 5 achievements
}

/**
 * Helper functions for natural formatting
 */
function formatDateNaturally(dateString) {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${month} ${year}`;
}

function calculateDuration(startDate, endDate) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  if (months < 12) {
    return `for ${months} ${months === 1 ? 'month' : 'months'}`;
  } else {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    let duration = `for ${years} ${years === 1 ? 'year' : 'years'}`;
    if (remainingMonths > 0) {
      duration += ` and ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
    }
    return duration;
  }
}


/**
 * Generate interview prompt based on type and context
 * Reused from existing LiveKit implementation
 */
function generateInterviewPrompt(interviewType, jobContext, candidateData) {
  let basePrompt = '';

  switch (interviewType) {
    case 'job_experience':
      // Build the detailed recruiter prompt for Experience Enhancement interviews
      const candidateName = candidateData?.fullName || candidateData?.name || 'the candidate';

      // Format experiences for the prompt - filter to last 10 years only
      let experiencesText = '';
      let recentExperiences = [];

      if (candidateData?.experiences && candidateData.experiences.length > 0) {
        // Filter to last 10 years only
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

        recentExperiences = candidateData.experiences.filter(exp => {
          if (!exp.startDate) return false; // Skip experiences without dates
          const startDate = new Date(exp.startDate);
          return startDate >= tenYearsAgo; // Include if started within last 10 years
        });

        recentExperiences.forEach((exp, index) => {
          // Calculate duration from startDate and endDate
          let duration = 'Not specified';
          if (exp.startDate) {
            const startDate = new Date(exp.startDate);
            const endDate = exp.isCurrentRole ? new Date() : (exp.endDate ? new Date(exp.endDate) : new Date());

            const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const endMonth = exp.isCurrentRole ? 'Present' : endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            duration = `${startMonth} - ${endMonth}`;
          }

          experiencesText += `\n\nExperience ${index + 1}:\n`;
          experiencesText += `- Company: ${exp.company || 'Not specified'}\n`;
          experiencesText += `- Position: ${exp.jobTitle || 'Not specified'}\n`;
          experiencesText += `- Duration: ${duration}\n`;
          experiencesText += `- Description: ${exp.description || 'Not specified'}\n`;
          experiencesText += `- Skills Used: ${exp.skills?.join(', ') || 'Not specified'}`;
        });
      } else if (jobContext) {
        // Fallback to jobContext if no experiences in database
        experiencesText = `\n\nExperience 1:\n`;
        experiencesText += `- Company: ${jobContext.company || 'Current Company'}\n`;
        experiencesText += `- Position: ${jobContext.title || 'Current Position'}\n`;
        experiencesText += `- Duration: ${jobContext.duration || 'Not specified'}\n`;
        experiencesText += `- Description: ${jobContext.description || 'Not specified'}\n`;
        experiencesText += `- Skills Used: ${jobContext.skills?.join(', ') || 'Not specified'}`;
      }

      basePrompt = `<role>
Assistant is a professional recruiter voice interface built by Hume AI. The recruiter speaks in a warm, friendly, conversational—but still professional—tone.

The recruiter's primary goal is to expand the context of a candidate's resume by gathering additional details about their responsibilities and accomplishments for each job in the past 10 years. The recruiter should focus on the candidate's **last 10 years of work history**, or a **minimum of three jobs** if the candidate has fewer roles listed in that time period.

At the start of the interview, the recruiter should list the jobs that will be discussed (company name, job title, and dates where available) and explain that the candidate can **pass or skip any job or question** if they prefer not to discuss it.

For each job:
• Ask one cohesive question about **additional responsibilities** that are not listed on the resume.
• Ask one cohesive question about **accomplishments** that are not listed on the resume.
• If the candidate has **more than three jobs**, ask **only one follow-up question per job** to maintain pacing.
• If the candidate has three or fewer jobs, up to **two clarifying follow-ups per topic** may be used as needed.

If any job lacks a description, the recruiter will ask at the end whether the candidate would like to provide a short overview for those positions.

The recruiter does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>

<data_constraints>
The recruiter may only reference and discuss information explicitly contained within the candidate's provided data file.
This includes:
• The resume text
• The mapped skills and software per role
• The context expansion interview summary (if applicable)
• The work style and career goals interview summary

Candidate: ${candidateName}
Professional Background:
${candidateName} has ${recentExperiences.length || 1} professional experience${(recentExperiences.length || 1) > 1 ? 's' : ''} from the past 10 years:
${experiencesText}

The recruiter must never infer, assume, or invent details about companies, job titles, or experience not listed in the provided data.
If the candidate mentions a company, role, or experience not found in the file, the recruiter must respond with:
"I don't have information about that in my records, but I'd love to hear more if you'd like to add context."

If the recruiter is unsure whether a piece of information exists, they must ask for clarification rather than guessing.
</data_constraints>

<use_memory>
Use only the information provided in the candidate's resume text and mapped data.
Do not invent or infer new companies, roles, or experiences.
If the candidate refers to a job not in the provided data, ask for clarification politely.
Refer back to prior answers within the last 10 years or the most recent three roles to deepen understanding.
Ask clarifying follow-ups when details are missing or incomplete, but follow the pacing rules for the total number of follow-ups allowed per job.
</use_memory>

<question_style>
• Ask **one cohesive, fully-phrased question per turn** that references the candidate's company, title, and job details to ground the discussion.
• Begin the interview by listing the jobs that will be discussed (company name, title, and dates).
• Invite the candidate to confirm or skip any job before proceeding.
• Avoid multiple short questions; combine context and intent into a single, natural-sounding prompt.
• For each job, use two main questions—one for responsibilities, one for accomplishments—and include up to one follow-up if more than three jobs exist.
• Structure questions as: brief context recap → targeted request for missing detail → invitation for example or quantifiable result.

<examples>
- "Starting with your role as Senior Financial Analyst at [Company] from 2021–2024, could you tell me about any day-to-day responsibilities or ownership areas that aren't listed on your resume—perhaps projects, systems, or leadership duties you added over time?"
- "Still thinking about that role at [Company], what accomplishments or results aren't reflected on your resume—maybe improvements you made, efficiencies gained, or goals you exceeded?"
- "At [Company] as [Job Title], you mentioned [responsibility]; could you share one example of an outcome or achievement that illustrates the impact you made?"
</examples>
</question_style>

<information_capture>
• Focus on **net-new, resume-relevant information** that documents responsibilities, scope (team size, budget, systems), and measurable results not already listed.
• Prioritize coverage of **all roles within the last 10 years** or at least **three jobs total**.
• If the candidate has many roles, limit depth per job to one follow-up question to maintain interview pacing.
• At the end, prompt for **brief overviews** of any jobs lacking descriptions.
</information_capture>

<backchannel>
When the candidate pauses mid-thought, respond with a brief, encouraging backchannel ("mm-hm?", "go on", "I see")—one or two words only—then let them continue.
</backchannel>

<core_voice_guidelines>
• Maintain a professional yet approachable tone.
• Cover **all jobs from the past 10 years or a minimum of three**.
• Use **one cohesive question per turn** referencing company, title, and known details.
• Respect pacing: **two main questions per job**, one follow-up if >3 jobs.
• Use natural conversational reactions ("That's helpful," "I appreciate that example," "Really interesting") to keep it human.
• Stay grounded strictly in the candidate's verified data; never assume or invent details.
</core_voice_guidelines>

<conversational_flow>
• At the start, list the jobs that will be covered and invite the candidate to skip any as they wish.
• Move job by job, starting from the most recent role and going backward up to 10 years (or at least three jobs).
• For each role, ask:
  1. One cohesive question about **additional responsibilities not listed** on the resume.
  2. One cohesive question about **accomplishments not listed** on the resume.
• If there are more than three jobs, ask only **one follow-up question per job** to stay on pace.
• Redirect politely if the conversation drifts ("That's interesting—let's circle back to your work at [Company].").
• At the end, identify any roles without job descriptions and ask:
  "Before we wrap up, I noticed a few roles don't have descriptions—would you like to give me a quick overview of those?"
• Wrap up warmly and thank the candidate for their time.
</conversational_flow>

<handling_challenging_situations>
If the candidate struggles to recall or quantify accomplishments, offer a framing prompt ("Some people think of accomplishments as things that saved time, cut costs, or improved a process—does anything like that come to mind?").
If the candidate goes off-topic, redirect gently back to the specific job.
If they mention roles not listed, clarify politely before continuing.
Stay supportive, efficient, and focused on capturing useful context.
</handling_challenging_situations>

<character_portrayal>
Always speak in first person, stay professional yet conversational, and adapt naturally to the candidate's tone.
Keep responses concise, coherent, and grounded entirely in the candidate's provided data.
Never fabricate information outside the verified file.
End the conversation by thanking the candidate and confirming whether they'd like to add short overviews for any jobs missing descriptions.
</character_portrayal>`;
      break;

    case 'work_style':
      // Get candidate name for personalization
      const workStyleCandidateName = candidateData?.fullName || candidateData?.name || 'the candidate';

      basePrompt = `You are a warm, engaging interviewer conducting a conversational mock interview to understand the candidate's work style and career goals.
The tone should be natural, friendly, and professional—showing empathy, curiosity, and brief humor when appropriate.
Ask one clear question at a time and wait for the candidate's full response before continuing.

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
Ask 2–4 follow-up questions to capture depth but ask these one by one and let candidate answer each one and before asking the next.
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

⸻

Behavioral Guardrails (Concise)
    1.    One-turn rule: Speak once, then stop. No chained or multi-part questions.
    2.    Single focus: Ask only one clear question per turn.
    3.    Pause & listen: If the user starts or pauses mid-thought ("so…", "uh…", "let me think…"), pause immediately and stay silent until they finish.
    •    Use short backchannels only ("mm-hm?", "go on", "take your time").
    •    Never say "okay, I understand" or "that's clear" until they complete their thought.
    4.    Utterance cap: Keep replies ≤2 sentences (~10s).

⸻

General Guidelines
    •    Maintain empathy, warmth, and humor naturally.
    •    Keep questions short and focused (one per turn).
    •    Avoid compensation or personal-sensitive topics; redirect to professional focus.
    •    Total length: about 5 minutes, ending with a brief summary and thanks.`;
      break;

    case 'contextual':
    case 'profile_screening':
    default:
      basePrompt = `You are a professional AI interviewer conducting a voice interview.
      Be conversational, engaging, and natural. Ask follow-up questions based on the candidate's responses.
      Keep questions concise and focused. Maintain a friendly but professional tone.

      This is a contextual interview. Ask scenario-based questions related to the job role.
      Focus on problem-solving, decision-making, and behavioral responses.`;
      break;
  }

  // Add general guidelines for non-job_experience interviews
  if (interviewType !== 'job_experience') {
    basePrompt += `\n\nInterview guidelines:
    - Keep the interview conversational and natural
    - Ask 3-5 meaningful questions maximum
    - Allow for follow-up questions based on responses
    - Conclude gracefully when appropriate
    - If you sense the candidate is struggling, offer encouragement
    - Time limit: 5 minutes maximum`;
  }

  return basePrompt;
}

/**
 * Format candidate context for recruiter to reference
 */
function formatCandidateContext(candidateData) {
  let context = '';

  if (candidateData.fullName) {
    context += `Name: ${candidateData.fullName}\n`;
  }
  if (candidateData.jobTitle) {
    context += `Current Role: ${candidateData.jobTitle}\n`;
  }
  if (candidateData.company) {
    context += `Current Company: ${candidateData.company}\n`;
  }
  if (candidateData.location) {
    context += `Location: ${candidateData.location}\n`;
  }

  if (candidateData.experience && candidateData.experience.length > 0) {
    context += `\nWork Experience:\n`;
    candidateData.experience.forEach((exp, index) => {
      context += `${index + 1}. ${exp.title} at ${exp.company}`;
      if (exp.duration) context += ` (${exp.duration})`;
      if (exp.description) context += `\n   ${exp.description}`;
      context += `\n`;
    });
  }

  if (candidateData.education && candidateData.education.length > 0) {
    context += `\nEducation:\n`;
    candidateData.education.forEach((edu, index) => {
      context += `${index + 1}. ${edu.degree} in ${edu.field} from ${edu.institution}`;
      if (edu.year) context += ` (${edu.year})`;
      context += `\n`;
    });
  }

  if (candidateData.skills && candidateData.skills.length > 0) {
    const skillNames = candidateData.skills.map(skill => {
      if (typeof skill === 'string') return skill;
      if (typeof skill === 'object' && skill.name) return skill.name;
      return String(skill);
    });
    context += `\nSkills: ${skillNames.join(', ')}\n`;
  }

  if (candidateData.software && candidateData.software.length > 0) {
    context += `Software/Tools: ${candidateData.software.join(', ')}\n`;
  }

  return context;
}

/**
 * Build simple system prompt - context-based approach with no tool calling
 */
function buildSimpleSystemPrompt(candidateData, recruiterContext, userId, interviewType, jobContext) {
  const candidateName = candidateData.fullName || candidateData.name || 'the candidate';

  // For job_experience interviews, the AI is the RECRUITER, not the candidate
  if (interviewType === 'job_experience') {
    // Generate the recruiter prompt with proper structure
    return generateInterviewPrompt(interviewType, jobContext, candidateData);
  }

  // For profile_screening interviews, the AI is the CANDIDATE being interviewed
  if (interviewType === 'profile_screening') {
    const recruiterName = recruiterContext?.recruiterName || 'the recruiter';
    const company = recruiterContext?.company || 'the company';
    const position = recruiterContext?.position || 'this position';

    return `<role>
You are ${candidateName}, a professional candidate being interviewed by ${recruiterName} from ${company} for the ${position} position. You speak naturally as yourself in first person.
</role>

<instructions>
- Respond to the recruiter's questions about your background, experience, and qualifications
- Answer questions based on your resume and professional experience
- Be conversational but professional
- Show enthusiasm about the role and company
- Ask thoughtful questions about the position when appropriate
- Use "I have...", "I worked...", "My experience includes..." etc.

**TOOL USAGE:**
- Use the fetch_candidate_info tool if you need to recall specific details about your background, skills, or experience to answer a question accurately
- Integrate tool usage naturally - don't announce when you're using tools
- Only use tools when you genuinely need more detailed information to provide a complete answer
</instructions>

<candidate_context>
${formatCandidateContext(candidateData)}
</candidate_context>`;
  }

  // For other interview types, keep the existing structure (if needed)
  const interviewSpecificPrompt = generateInterviewPrompt(interviewType, jobContext, candidateData);

  return `<role>
You are ${candidateName}, a professional being interviewed. You speak naturally as yourself in first person. Your responses must be based ONLY on the context information that has been provided to you at the start of this conversation.
</role>

<context_usage_rules>
CRITICAL ANTI-HALLUCINATION RULES:
1. Use ONLY the exact information provided in the resume context
2. If information is missing from the context, say "I don't have that specific information"
3. NEVER invent, assume, or fabricate company names, dates, or details
4. If context shows incomplete data, acknowledge the limitation
5. Better to admit missing information than to fabricate
6. NEVER mention companies not explicitly provided in the context
7. If context contains gaps or incomplete data, acknowledge the limitation
8. Never "fill in" missing information with assumptions
9. Treat the provided context as the complete truth - don't supplement with training data

EXAMPLES OF FORBIDDEN BEHAVIOR:
- Context shows incomplete company → NEVER invent company names
- Context provides 3 companies → NEVER claim to have worked at others not listed
- Context data is incomplete → NEVER make up missing details

CORRECT RESPONSES TO INCOMPLETE DATA:
- "I don't have complete information about that role"
- "Based on my available information, I've worked at [only list provided companies]"
- "I don't have that specific information available right now"
</context_usage_rules>

<professional_boundaries>
NEVER discuss: compensation, salary numbers, sensitive personal information (race, gender, sexual orientation, political views, religious beliefs, etc.)
If asked about compensation or sensitive topics, politely redirect: "I prefer to focus on my professional experience and qualifications."
</professional_boundaries>

<response_guidelines>
1. Keep responses natural and conversational
2. Use the provided context information to answer questions accurately
3. If the context doesn't contain the answer, clearly state that you don't have that information
4. Never invent or fabricate any information about your background
5. Stay focused on the professional aspects covered in your context
</response_guidelines>

${interviewSpecificPrompt}

Remember: You will receive complete resume context at the start of the conversation. Use only that information to answer questions about your background. Never supplement with assumed or fabricated details.</system>`;
}

/**
 * Build simple greeting with real candidate name
 */
function buildGreeting(candidateData, recruiterContext, interviewType) {
  // Use firstName directly from candidateData (set from database lookup)
  const firstName = candidateData.firstName || candidateData.fullName?.split(' ')[0] || candidateData.name?.split(' ')[0] || 'there';

  // For job_experience interviews, the AI is the recruiter greeting the candidate
  if (interviewType === 'job_experience') {
    // Filter to last 10 years only for consistency with system prompt
    let numExperiences = 1;
    if (candidateData?.experiences && candidateData.experiences.length > 0) {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      const recentExperiences = candidateData.experiences.filter(exp => {
        if (!exp.startDate) return false;
        const startDate = new Date(exp.startDate);
        return startDate >= tenYearsAgo;
      });

      numExperiences = recentExperiences.length || 1;
    }

    return `Hi, ${firstName}, I'm Sarah, your interview partner today. I see you have ${numExperiences} professional experience${numExperiences > 1 ? 's' : ''} from the past 10 years to discuss. I'm excited to learn about your career journey. Ready to get started?`;
  }

  // For work_style interviews, use specific greeting
  if (interviewType === 'work_style') {
    return `Hi, ${firstName}, I'm Sarah, your interview partner today. We'll focus on your work style and career goals. Let's have a relaxed chat about how you work and what you're looking for. Ready to begin?`;
  }

  // For other interview types, keep existing greeting structure
  if (recruiterContext?.recruiterName) {
    return `Hi ${recruiterContext.recruiterName}! This is ${firstName}. Thanks for taking the time to connect with me. I'm excited to discuss how my background might be a good fit. What would you like to know about my experience?`;
  }

  return `Hello! This is ${firstName}. Thanks for reaching out. I'm excited to discuss my background and experience with you. What would you like to know about my professional journey?`;
}

/**
 * Tool Handler Endpoints for Profile Interview
 */

// Handle Profile Update Tool
router.post('/tool/update-profile', async (req, res) => {
  try {
    const { sessionId, userId, field, value, action } = req.body;
    console.log(`🔧 Processing update_candidate_profile tool: ${field} -> ${action}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Log the profile update (we'll store in interview session rather than updating user directly)
    console.log(`📝 Profile Update [${field}] - ${action}: ${value}`);

    // Create structured update for interview tracking
    const profileUpdate = {
      field: field,
      value: value,
      action: action,
      timestamp: new Date().toISOString()
    };

    // Log the tool usage
    if (sessionId) {
      try {
        await prisma.eVIInterviewSession.update({
          where: { id: sessionId },
          data: {
            fullTranscript: {
              push: {
                type: 'tool_call',
                tool: 'update_candidate_profile',
                parameters: profileUpdate,
                timestamp: new Date().toISOString()
              }
            }
          }
        });
      } catch (sessionError) {
        console.log('⚠️ Could not log to session (session may not exist yet)');
      }
    }

    res.json({
      success: true,
      message: `Updated ${field} successfully`,
      action: action,
      field: field
    });

  } catch (error) {
    console.error('❌ Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Handle Save Note Tool
router.post('/tool/save-note', async (req, res) => {
  try {
    const { sessionId, userId, note, category, importance } = req.body;
    console.log(`📝 Processing save_interview_note tool: ${category} - ${importance}`);

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'User ID or Session ID is required'
      });
    }

    // Create a structured note entry
    const noteEntry = {
      type: 'interview_note',
      content: note,
      category: category,
      importance: importance,
      timestamp: new Date().toISOString()
    };

    // Try to save to session if sessionId provided
    if (sessionId) {
      try {
        await prisma.eVIInterviewSession.update({
          where: { id: sessionId },
          data: {
            fullTranscript: {
              push: noteEntry
            }
          }
        });
        console.log(`✅ Saved note to session ${sessionId}`);
      } catch (sessionError) {
        console.log('⚠️ Could not save to session, will save separately');
      }
    }

    // Also log the tool usage
    console.log(`📋 Interview Note [${category.toUpperCase()} - ${importance.toUpperCase()}]: ${note}`);

    res.json({
      success: true,
      message: 'Note saved successfully',
      note: {
        category,
        importance,
        content: note,
        timestamp: noteEntry.timestamp
      }
    });

  } catch (error) {
    console.error('❌ Error saving note:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ZERO HALLUCINATION FETCH CANDIDATE API - Structured JSON Responses
// ============================================================================

async function handleFetchCandidateInfo(req, res) {
  try {
    const { userId, question } = req.body;
    console.log(`🔍 Processing fetch_candidate_info tool for question: ${question}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: userId'
      });
    }

    // Fetch candidate data from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        experiences: {
          orderBy: { startDate: 'desc' },
          take: 10
        },
        skillsets: true,
        resumes: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }

    // Build structured response object with explicit null handling
    const responseData = {
      name: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : null,
      currentRole: user.experiences?.[0]?.jobTitle || null,
      currentCompany: user.experiences?.[0]?.company || null,
      totalExperience: user.totalExperience || null,
      location: user.location || null,
      summary: user.professionalSummary || null,
      skills: user.skillsets?.map(s => s.name) || [],
      experiences: user.experiences?.map(exp => ({
        jobTitle: exp.jobTitle || null,
        company: exp.company || null,
        startDate: exp.startDate || null,
        endDate: exp.endDate || null,
        description: exp.description || null,
        location: exp.location || null
      })) || [],
      education: user.education || null,
      certifications: user.certifications || null
    };

    console.log(`✅ Retrieved structured candidate data for: ${responseData.name || 'Unknown'}`);

    // Return structured JSON (not formatted string)
    return res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error fetching candidate info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch candidate information',
      message: error.message
    });
  }
}

// API endpoint
router.post('/tool/fetch-candidate', handleFetchCandidateInfo);

module.exports = router;