const express = require('express');
const { body, validationResult } = require('express-validator');
const eviInterviewService = require('../services/eviInterviewService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateCompleteInterview = [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('userId').notEmpty().withMessage('User ID is required'),
  body('jobTitle').notEmpty().withMessage('Job title is required'),
  body('company').notEmpty().withMessage('Company is required'),
  body('transcript').isArray().withMessage('Transcript must be an array'),
  body('totalDurationSeconds').isNumeric().withMessage('Duration must be a number'),
  body('experienceId').optional().isString().withMessage('Experience ID must be a string')
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
 * POST /api/evi-interviews/complete
 * Process completed EVI interview
 */
router.post('/complete', validateCompleteInterview, handleValidationErrors, async (req, res) => {
  try {
    console.log('🎯 Processing completed EVI interview...');
    
    const {
      sessionId,
      userId,
      jobTitle,
      company,
      jobDescription,
      duration,
      transcript,
      emotions,
      audioBlob,
      totalDurationSeconds,
      humeSessionId,
      humeConfigId,
      selectedVoice,
      experienceId
    } = req.body;

    // Convert base64 audio to buffer if provided
    let audioBlobBuffer = null;
    if (audioBlob) {
      try {
        // Handle base64 encoded audio
        const base64Data = audioBlob.replace(/^data:audio\/\w+;base64,/, '');
        audioBlobBuffer = {
          arrayBuffer: () => Promise.resolve(Buffer.from(base64Data, 'base64').buffer)
        };
      } catch (audioError) {
        console.warn('⚠️ Audio processing failed:', audioError);
        // Continue without audio
      }
    }

    const result = await eviInterviewService.processCompletedInterview({
      sessionId,
      userId,
      experienceId,
      jobTitle,
      company,
      jobDescription,
      duration,
      transcript,
      emotions,
      audioBlob: audioBlobBuffer,
      totalDurationSeconds,
      humeSessionId,
      humeConfigId,
      selectedVoice
    });

    res.json({
      success: true,
      message: 'Interview processed successfully',
      data: result
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
 * GET /api/evi-interviews/session/:sessionId
 * Get interview session by ID
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await eviInterviewService.getInterviewSession(sessionId);
    
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
 * GET /api/evi-interviews/user/:userId/history
 * Get user's interview history
 */
router.get('/user/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    const sessions = await eviInterviewService.getUserInterviewHistory(userId, parseInt(limit));

    res.json({
      success: true,
      data: sessions
    });

  } catch (error) {
    console.error('❌ Error fetching interview history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interview history',
      details: error.message
    });
  }
});

/**
 * GET /api/evi-interviews/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EVI Interview service is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;