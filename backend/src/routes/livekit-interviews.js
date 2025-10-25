const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');

const prisma = new PrismaClient();
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
  body('duration').optional().isNumeric().withMessage('Duration must be a number')
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
      duration
    } = req.body;

    // Generate full transcript text
    const fullTranscript = transcript.map(entry =>
      `[${new Date(entry.timestamp).toISOString()}] ${entry.speaker}: ${entry.text}`
    ).join('\n\n');

    // Generate AI highlights
    console.log('🤖 Generating interview highlights...');
    const highlights = await generateHighlights(transcript);

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
        highlights: session.highlights,
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