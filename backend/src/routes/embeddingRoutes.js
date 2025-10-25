const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  generateAllUserEmbeddings,
  generateEmbeddingsForResume,
  generateEmbeddingsForPersonalInfo,
  generateEmbeddingsForInterview,
  generateEmbeddingsForExperiences
} = require('../services/embeddingService');

/**
 * POST /api/embeddings/regenerate
 * Manually regenerate all embeddings for a user
 */
router.post('/regenerate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`🔄 Manual regeneration request - User: ${userId}`);

    const results = await generateAllUserEmbeddings(userId);

    // Count successful operations
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalOperations = Object.keys(results).length;

    res.json({
      success: true,
      message: `Regenerated ${successCount}/${totalOperations} embedding types successfully`,
      data: results
    });

  } catch (error) {
    console.error('❌ Manual regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate embeddings',
      details: error.message
    });
  }
});

/**
 * POST /api/embeddings/resume
 * Regenerate only resume embeddings
 */
router.post('/resume', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`📄 Resume embedding regeneration - User: ${userId}`);

    const result = await generateEmbeddingsForResume(userId);

    if (result.success) {
      res.json({
        success: true,
        message: `Resume embeddings created: ${result.chunksCreated} chunks`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to generate resume embeddings',
        data: result
      });
    }

  } catch (error) {
    console.error('❌ Resume embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate resume embeddings',
      details: error.message
    });
  }
});

/**
 * POST /api/embeddings/personal-info
 * Regenerate personal info embeddings
 */
router.post('/personal-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`👤 Personal info embedding regeneration - User: ${userId}`);

    const result = await generateEmbeddingsForPersonalInfo(userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Personal info embeddings created',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to generate personal info embeddings',
        data: result
      });
    }

  } catch (error) {
    console.error('❌ Personal info embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate personal info embeddings',
      details: error.message
    });
  }
});

/**
 * POST /api/embeddings/experiences
 * Regenerate experience embeddings
 */
router.post('/experiences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`💼 Experience embedding regeneration - User: ${userId}`);

    const result = await generateEmbeddingsForExperiences(userId);

    if (result.success) {
      res.json({
        success: true,
        message: `Experience embeddings created: ${result.chunksCreated} chunks`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to generate experience embeddings',
        data: result
      });
    }

  } catch (error) {
    console.error('❌ Experience embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate experience embeddings',
      details: error.message
    });
  }
});

/**
 * POST /api/embeddings/interview
 * Regenerate interview embeddings for specific type
 */
router.post('/interview', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { interviewType } = req.body;

    if (!interviewType) {
      return res.status(400).json({
        success: false,
        error: 'interviewType is required (job_experience or work_style)'
      });
    }

    if (!['job_experience', 'work_style'].includes(interviewType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid interviewType. Must be job_experience or work_style'
      });
    }

    console.log(`💬 Interview embedding regeneration - User: ${userId}, Type: ${interviewType}`);

    const result = await generateEmbeddingsForInterview(userId, interviewType);

    if (result.success) {
      res.json({
        success: true,
        message: `${interviewType} interview embeddings created: ${result.chunksCreated} chunks`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || `Failed to generate ${interviewType} interview embeddings`,
        data: result
      });
    }

  } catch (error) {
    console.error('❌ Interview embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate interview embeddings',
      details: error.message
    });
  }
});

/**
 * GET /api/embeddings/status
 * Check embedding status for current user
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Count chunks by source type
    const chunkCounts = await prisma.$queryRaw`
      SELECT source_type, COUNT(*)::int as count
      FROM user_context_chunks
      WHERE user_id = ${userId}
      GROUP BY source_type
    `;

    // Get total count
    const totalCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int as total
      FROM user_context_chunks
      WHERE user_id = ${userId}
    `;

    res.json({
      success: true,
      data: {
        userId,
        totalChunks: totalCount[0]?.total || 0,
        chunksByType: chunkCounts || [],
        hasEmbeddings: totalCount[0]?.total > 0
      }
    });

  } catch (error) {
    console.error('❌ Error checking embedding status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check embedding status',
      details: error.message
    });
  }
});

module.exports = router;