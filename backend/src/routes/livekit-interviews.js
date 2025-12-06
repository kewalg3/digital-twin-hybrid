const express = require('express');
const { body, validationResult } = require('express-validator');

const OpenAI = require('openai');

const prisma = require('../lib/prisma');
const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validation middleware
const validateCompleteInterview = [
  body('roomName').notEmpty().withMessage('Room name is required'),
  body('candidateId').notEmpty().withMessage('Candidate ID is required'),
  body('transcript').isArray().withMessage('Transcript must be an array'),
  body('duration').optional().isNumeric().withMessage('Duration must be a number'),
  body('interviewType').optional().isString().withMessage('Interview type must be a string'),
  body('experienceData').optional().isObject().withMessage('Experience data must be an object')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * Extract work style insights for work style interviews using OpenAI
 */
async function extractWorkStyleInsights({ transcript }) {
  try {
    console.log('🧠 Extracting work style insights with OpenAI...');

    // Format transcript for OpenAI (LiveKit format)
    const transcriptText = transcript.map(entry =>
      `${entry.speaker === 'agent' ? 'AI:' : 'Candidate:'} ${entry.text}`
    ).join('\n');

    const prompt = `Interview Transcript:
${transcriptText}

Extract the candidate's work style preferences and career goals based on this transcript.

IMPORTANT: If the transcript is very brief or lacks substantial content, provide reasonable defaults and indicate that more discussion is needed rather than making assumptions.

Return a JSON object in this exact format:
{
  "workStyle": {
    "preferredEnvironment": "Description of ideal work environment",
    "collaborationStyle": "How they work with others",
    "communicationPreferences": "How they prefer to communicate",
    "workPace": "fast-paced/steady/flexible",
    "structurePreference": "structured/flexible/hybrid"
  },
  "careerGoals": {
    "shortTerm": "1-2 year goals",
    "longTerm": "3-5 year aspirations",
    "idealRole": "Description of ideal next position",
    "industries": ["interested industries"],
    "companySize": "startup/mid-size/enterprise/flexible"
  },
  "strengths": [
    "Key personal strength 1",
    "Key personal strength 2"
  ],
  "motivations": [
    "What drives them professionally",
    "What they find fulfilling"
  ]
}

Extract insights directly from the transcript. Do not make assumptions beyond what was discussed.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional career counselor analyzing work style preferences and career aspirations. Extract structured insights about how the candidate likes to work and what they're looking for in their career. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const aiResponse = response.choices[0].message.content.trim();
    console.log('🤖 OpenAI work style response generated');

    // Parse JSON response
    let insights;
    try {
      insights = JSON.parse(aiResponse);

      // Validate that we have the expected structure
      if (!insights.workStyle || !insights.careerGoals) {
        throw new Error('Invalid response structure from OpenAI');
      }

      console.log('✅ Successfully parsed work style insights');
    } catch (parseError) {
      console.warn('⚠️ Failed to parse OpenAI JSON, creating fallback structure:', parseError);
      // Fallback: create basic structure
      insights = {
        workStyle: {
          preferredEnvironment: "Professional environment with growth opportunities",
          collaborationStyle: "Team-oriented with independent work capability",
          communicationPreferences: "Clear and direct communication",
          workPace: "flexible",
          structurePreference: "hybrid"
        },
        careerGoals: {
          shortTerm: "Continue developing professional skills",
          longTerm: "Advance in career with increasing responsibilities",
          idealRole: "Role that matches skills and interests",
          industries: ["technology"],
          companySize: "flexible"
        },
        strengths: ["Professional communication", "Adaptability"],
        motivations: ["Professional growth", "Making an impact"]
      };
    }

    return insights;

  } catch (error) {
    console.error('❌ Error extracting work style insights:', error);
    // Return fallback insights
    return {
      workStyle: {
        preferredEnvironment: "Unable to extract from interview",
        collaborationStyle: "Unable to extract from interview",
        communicationPreferences: "Unable to extract from interview",
        workPace: "unknown",
        structurePreference: "unknown"
      },
      careerGoals: {
        shortTerm: "Unable to extract from interview",
        longTerm: "Unable to extract from interview",
        idealRole: "Unable to extract from interview",
        industries: [],
        companySize: "unknown"
      },
      strengths: [],
      motivations: []
    };
  }
}

/**
 * Extract achievements for experience enhancement interviews using OpenAI
 */
async function extractAchievements({ transcript, experienceData }) {
  try {
    console.log('🧠 Extracting achievements for experience enhancement interview...');

    // Format transcript for OpenAI (note: LiveKit format is different from EVI format)
    const transcriptText = transcript.map(entry =>
      `${entry.speaker === 'agent' ? 'AI:' : 'Candidate:'} ${entry.text}`
    ).join('\n');

    // Extract job details from experience data
    const jobTitle = experienceData?.title || 'Not specified';
    const company = experienceData?.company || 'Not specified';
    const duration = experienceData?.duration || 'Not specified';

    const prompt = `Job Title: ${jobTitle}
Company: ${company}
Duration: ${duration || 'Not specified'}

Transcript of the Interview:
${transcriptText}

Extract formal bullet points summarizing the candidate's achievements or contributions based ONLY on what they specifically said in the interview transcript above.

CRITICAL RULES:
- Only extract achievements that were explicitly mentioned by the candidate in the transcript
- Do NOT use any information from the job description
- Do NOT infer or assume achievements that weren't directly stated
- If the candidate didn't provide enough specific information about achievements, return an empty array

Return a JSON object in this exact format:
{
  "achievements": [
    {"text": "Achievement description starting with action verb", "category": "technical"},
    {"text": "Another achievement description", "category": "leadership"}
  ],
  "summary": {
    "totalAchievements": 4,
    "dominantCategories": ["technical", "leadership"]
  }
}

Categories should be: "technical", "leadership", "process_improvement", "business_impact", or "collaboration"
Keep each bullet concise and specific.
If no clear achievements were mentioned in the interview, return {"achievements": [], "summary": {"totalAchievements": 0, "dominantCategories": []}}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional resume writer. Extract achievements as structured JSON with bullet points starting with action verbs. ONLY extract achievements that were explicitly stated by the candidate in the interview transcript. Do NOT use job description information. If no specific achievements were mentioned, return an empty achievements array. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const aiResponse = response.choices[0].message.content.trim();
    console.log('🤖 OpenAI achievements response:', aiResponse);

    // Parse JSON response
    let achievements;
    try {
      achievements = JSON.parse(aiResponse);
      console.log('✅ Successfully parsed achievements:', JSON.stringify(achievements, null, 2));
      console.log('📊 Achievement count:', achievements.achievements ? achievements.achievements.length : 0);
    } catch (parseError) {
      console.error('⚠️ Failed to parse OpenAI JSON:', parseError);
      console.log('Raw response that failed to parse:', aiResponse);
      // Fallback: return empty achievements
      achievements = {
        achievements: [],
        summary: {
          totalAchievements: 0,
          dominantCategories: []
        }
      };
    }

    return achievements;

  } catch (error) {
    console.error('❌ Error extracting achievements:', error);
    // Return empty achievements on error
    return {
      achievements: [],
      summary: {
        totalAchievements: 0,
        dominantCategories: []
      }
    };
  }
}

/**
 * Generate interview brief for experience enhancement interviews using OpenAI
 */
async function generateInterviewBrief(transcript) {
  try {
    console.log('📝 Generating experience enhancement interview brief...');

    // Format transcript for OpenAI
    const transcriptText = transcript.map(entry =>
      `${entry.speaker === 'agent' ? 'AI:' : 'Candidate:'} ${entry.text}`
    ).join('\n');

    const prompt = `Based on this job experience interview transcript, create a concise brief summarizing:
1. Key technical skills and expertise demonstrated
2. Most significant achievements and impacts
3. Leadership or collaboration examples
4. Problem-solving approaches used

Only include information explicitly stated in the transcript. Do not make assumptions or infer details not mentioned.
Keep the brief under 200 words.

Transcript:
${transcriptText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional interviewer creating concise briefs from interview transcripts. Only use information explicitly stated. Never make assumptions or add information not in the transcript."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 400
    });

    const brief = response.choices[0].message.content.trim();
    console.log('✅ Interview brief generated successfully');

    return {
      summary: brief,
      generatedAt: new Date().toISOString(),
      wordCount: brief.split(' ').length
    };

  } catch (error) {
    console.error('❌ Error generating interview brief:', error);
    // Return a fallback brief
    return {
      summary: "Interview transcript processed. Please refer to full transcript for details.",
      generatedAt: new Date().toISOString(),
      wordCount: 0,
      error: true
    };
  }
}

/**
 * Generate interview brief for work style interviews using OpenAI
 */
async function generateWorkStyleBrief(transcript) {
  try {
    console.log('📝 Generating work style interview brief...');

    // Format transcript for OpenAI
    const transcriptText = transcript.map(entry =>
      `${entry.speaker === 'agent' ? 'AI:' : 'Candidate:'} ${entry.text}`
    ).join('\n');

    const prompt = `Based on this work style interview transcript, create a concise brief summarizing:
1. Work environment preferences (remote/hybrid/office, team size, company culture)
2. Key personality traits and work characteristics
3. Team collaboration and communication style
4. Career aspirations and growth goals
5. Management and leadership preferences

Only include information explicitly stated in the transcript. Do not make assumptions or infer details not mentioned.
Keep the brief under 200 words, focusing on practical insights that would help with team fit and role alignment.

Transcript:
${transcriptText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional career counselor creating concise work style briefs from interview transcripts. Focus on practical insights about work preferences, personality traits, and career goals. Only use information explicitly stated. Never make assumptions or add information not in the transcript."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 400
    });

    const brief = response.choices[0].message.content.trim();
    console.log('✅ Work style brief generated successfully');

    return {
      summary: brief,
      generatedAt: new Date().toISOString(),
      wordCount: brief.split(' ').length,
      type: 'work_style'
    };

  } catch (error) {
    console.error('❌ Error generating work style brief:', error);
    // Return a fallback brief
    return {
      summary: "Work style interview transcript processed. Please refer to full transcript for details.",
      generatedAt: new Date().toISOString(),
      wordCount: 0,
      type: 'work_style',
      error: true
    };
  }
}

/**
 * Generate interview highlights using OpenAI
 */
async function generateHighlights(transcript) {
  try {
    // Format transcript for OpenAI
    const formattedTranscript = transcript.map(entry =>
      `${entry.speaker === 'agent' ? 'Candidate' : 'Recruiter'}: ${entry.text}`
    ).join('\n');

    const prompt = `You are analyzing a job interview transcript. Generate concise, specific insights based ONLY on what was actually discussed in the conversation.

TRANSCRIPT:
${formattedTranscript}

Provide analysis in this JSON format:
{
  "keyInsights": [
    "First specific point discussed (e.g., 'Mentioned 10+ years experience in EdTech')",
    "Second specific point (e.g., 'Led teams of 50+ across multiple countries')",
    "Third specific point (e.g., 'Built AI-powered platforms for learning')",
    "Fourth specific point if applicable"
  ],
  "recruiterRecommendation": "2-3 sentence recommendation based on the conversation. Be specific about strengths observed and next steps.",
  "matchQuality": "Good Match" or "Strong Match" or "Needs More Assessment"
}

CRITICAL RULES:
- Only include information explicitly mentioned in the transcript
- Be specific with numbers, technologies, companies mentioned
- Don't infer or hallucinate - if not discussed, don't include it
- Keep insights concise (one line each)
- Make recommendation actionable

Output ONLY valid JSON.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a strict fact-checker analyzing interview transcripts. Extract ONLY information explicitly stated in the conversation. Never infer, assume, or add information not present in the transcript. Output only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Error generating highlights:', error);
    return {
      keySkills: [],
      experience: [],
      strengths: [],
      summary: 'Unable to generate summary',
      fitScore: 0
    };
  }
}

/**
 * POST /api/livekit-interviews/complete
 * Save completed LiveKit interview transcript
 */
router.post('/complete', validateCompleteInterview, handleValidationErrors, async (req, res) => {
  try {
    console.log('🎯 Processing completed LiveKit interview...');

    const {
      roomName,
      candidateId,
      recruiterId,
      transcript,
      duration,
      interviewType,
      experienceData
    } = req.body;

    // Generate full transcript text
    const fullTranscript = transcript.map(entry =>
      `[${new Date(entry.timestamp).toISOString()}] ${entry.speaker}: ${entry.text}`
    ).join('\n\n');

    // Generate AI highlights or achievements based on interview type
    let highlights, achievements, interviewBrief;

    if (interviewType === 'experience_enhancement') {
      console.log('🎯 Processing experience enhancement interview...');
      // For experience enhancement interviews, extract achievements and brief (like EVI)
      achievements = await extractAchievements({ transcript, experienceData });
      interviewBrief = await generateInterviewBrief(transcript);

      // Set highlights to null for experience enhancement interviews (UI will use achievements instead)
      highlights = null;
    } else if (interviewType === 'work_style') {
      console.log('🎯 Processing work style interview...');
      // For work style interviews, extract insights about work preferences and career goals
      highlights = await extractWorkStyleInsights({ transcript });
      interviewBrief = await generateWorkStyleBrief(transcript);
      achievements = null;
    } else {
      console.log('🤖 Generating standard interview highlights...');
      // For regular interviews, generate highlights as before
      highlights = await generateHighlights(transcript);
      achievements = null;
      interviewBrief = null;
    }

    // Save to database
    console.log('💾 Saving interview session to database...');
    const session = await prisma.liveKitInterviewSession.create({
      data: {
        candidateId,
        recruiterId,
        roomName,
        transcript,
        fullTranscript,
        duration,
        highlights,
        achievements,
        interviewBrief,
        interviewType: interviewType || 'general',
        experienceData,
        status: 'completed',
        startedAt: new Date(transcript[0]?.timestamp || Date.now()),
        completedAt: new Date()
      },
      include: {
        candidate: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    console.log(`✅ LiveKit interview session saved: ${session.id}`);

    res.json({
      success: true,
      message: 'Interview processed successfully',
      data: {
        sessionId: session.id,
        roomName: session.roomName,
        interviewType: session.interviewType,
        highlights: session.highlights,
        achievements: session.achievements,
        interviewBrief: session.interviewBrief,
        candidate: session.candidate
      }
    });

  } catch (error) {
    console.error('❌ Error in complete interview endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process interview',
      details: error.message
    });
  }
});

/**
 * GET /api/livekit-interviews/session/:roomName
 * Get interview session by room name
 */
router.get('/session/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;

    const session = await prisma.liveKitInterviewSession.findUnique({
      where: { roomName },
      include: {
        candidate: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('❌ Error fetching interview session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interview session',
      details: error.message
    });
  }
});

/**
 * GET /api/livekit-interviews/candidate/:candidateId
 * Get all interview sessions for a candidate
 */
router.get('/candidate/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { limit = 10 } = req.query;

    const sessions = await prisma.liveKitInterviewSession.findMany({
      where: { candidateId },
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        roomName: true,
        duration: true,
        highlights: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      data: sessions
    });

  } catch (error) {
    console.error('❌ Error fetching candidate interviews:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interview history',
      details: error.message
    });
  }
});

/**
 * GET /api/livekit-interviews/candidate/:candidateId/briefs
 * Get all interview briefs for a candidate to display in profile
 */
router.get('/candidate/:candidateId/briefs', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { includeTranscripts = false } = req.query;

    console.log(`📚 Fetching interview briefs for candidate: ${candidateId}`);

    // Fetch all completed interview sessions with briefs
    const sessions = await prisma.liveKitInterviewSession.findMany({
      where: {
        candidateId,
        status: 'completed'
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        roomName: true,
        interviewType: true,
        interviewBrief: true,
        highlights: true,
        achievements: true,
        duration: true,
        startedAt: true,
        completedAt: true,
        experienceData: true,
        recruiter: {
          select: {
            id: true,
            name: true,
            company: true,
            title: true
          }
        },
        // Optionally include transcript if requested
        ...(includeTranscripts && { transcript: true })
      }
    });

    // Also check for EVI interview sessions (different table)
    const eviSessions = await prisma.eVIInterviewSession.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        interviewBrief: true,
        achievements: true,
        experienceData: true,
        duration: true,
        createdAt: true
      }
    });

    // Transform data for frontend consumption
    const briefs = {
      livekitInterviews: sessions.map(session => ({
        id: session.id,
        type: session.interviewType || 'general',
        brief: session.interviewBrief,
        highlights: session.highlights,
        achievements: session.achievements,
        duration: session.duration,
        date: session.completedAt || session.startedAt,
        recruiter: session.recruiter,
        experienceData: session.experienceData
      })),
      eviInterviews: eviSessions.map(session => ({
        id: session.id,
        type: 'experience_enhancement_evi',
        brief: session.interviewBrief,
        achievements: session.achievements,
        duration: session.duration,
        date: session.createdAt,
        experienceData: session.experienceData
      })),
      summary: {
        totalInterviews: sessions.length + eviSessions.length,
        byType: {
          experience: sessions.filter(s => s.interviewType === 'experience_enhancement').length + eviSessions.length,
          workStyle: sessions.filter(s => s.interviewType === 'work_style').length,
          general: sessions.filter(s => s.interviewType === 'general' || !s.interviewType).length
        }
      }
    };

    console.log(`✅ Found ${briefs.summary.totalInterviews} interview briefs`);

    res.json({
      success: true,
      data: briefs
    });

  } catch (error) {
    console.error('❌ Error fetching interview briefs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interview briefs',
      details: error.message
    });
  }
});

/**
 * GET /api/livekit-interviews/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'LiveKit Interview service is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;