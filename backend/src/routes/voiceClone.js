const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const cartesiaService = require('../services/cartesiaService');
const auth = require('../middleware/auth');

const router = express.Router();

// Add JSON parsing for non-upload routes (preview, status, etc.)
router.use(express.json({ limit: '10mb' }));

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files AND webm/mp4 video (audio-only from MediaRecorder)
    if (file.mimetype.startsWith('audio/') ||
        file.mimetype === 'video/webm' ||
        file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Only audio/video files are allowed'), false);
    }
  },
});

// GET /api/voice/samples - Get available voice samples for preview
router.get('/samples', async (req, res) => {
  try {
    // Get available Cartesia voices
    const voices = await cartesiaService.getAvailableVoices();

    // Filter for male and female voices
    const maleVoices = voices.filter(v => v.gender === 'male').slice(0, 3);
    const femaleVoices = voices.filter(v => v.gender === 'female').slice(0, 3);

    res.json({
      success: true,
      voices: {
        male: maleVoices,
        female: femaleVoices
      }
    });
  } catch (error) {
    console.error('Failed to get voice samples:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve voice samples'
    });
  }
});

// POST /api/voice/select - Select a pre-built voice (male/female)
router.post('/select', auth, async (req, res) => {
  try {
    const { voiceType, voiceId } = req.body;
    const userId = req.user.userId;

    if (!voiceType || !['male', 'female', 'cloned'].includes(voiceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid voice type. Must be "male", "female", or "cloned"'
      });
    }

    if (!voiceId) {
      return res.status(400).json({
        success: false,
        error: 'Voice ID is required'
      });
    }

    // Define known working voice IDs
    const KNOWN_VOICE_IDS = [
      '729651dc-c6c3-4ee5-97fa-350da1f88600',  // male
      '829ccd10-f8b3-43cd-b8a0-4aeaa81f3b30'   // female
    ];

    // Skip verification for cloned voices AND known voice IDs
    if (voiceType !== 'cloned' && !KNOWN_VOICE_IDS.includes(voiceId)) {
      const voiceExists = await cartesiaService.verifyVoiceExists(voiceId);
      if (!voiceExists) {
        return res.status(400).json({
          success: false,
          error: 'Invalid voice ID'
        });
      }
    }

    // Update user's voice preferences
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        profileVoiceId: voiceId,
        profileVoiceType: voiceType,
        voiceCloneStatus: 'completed',
        voiceClonedAt: new Date(),
        profileVoiceUrl: null // Clear any previous cloned voice URL
      }
    });

    res.json({
      success: true,
      message: `${voiceType} voice selected successfully`,
      voiceData: {
        voiceId: user.profileVoiceId,
        voiceType: user.profileVoiceType,
        status: user.voiceCloneStatus
      }
    });
  } catch (error) {
    console.error('Failed to select voice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save voice selection'
    });
  }
});

// POST /api/voice/clone - Upload audio for voice cloning
router.post('/clone', auth, upload.single('audio'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        error: 'Audio file is required'
      });
    }

    // Get user info for voice naming
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true }
    });

    // Update user status to processing
    await prisma.user.update({
      where: { id: userId },
      data: {
        voiceCloneStatus: 'processing'
      }
    });

    try {
      // Clone voice using Cartesia
      const cloneResult = await cartesiaService.cloneVoice(audioFile, userId, currentUser);

      // Save cloned voice ID (don't set as selected voice yet)
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          clonedVoiceId: cloneResult.voiceId,
          voiceCloneStatus: 'completed',
          voiceClonedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Voice cloned successfully',
        voiceData: {
          voiceId: cloneResult.voiceId, // Return the actual cloned voice ID
          voiceType: user.profileVoiceType,
          audioUrl: user.profileVoiceUrl,
          status: user.voiceCloneStatus
        }
      });
    } catch (cloneError) {
      // Update status to failed
      await prisma.user.update({
        where: { id: userId },
        data: {
          voiceCloneStatus: 'failed'
        }
      });

      throw cloneError;
    }
  } catch (error) {
    console.error('Voice cloning failed:', error);
    res.status(500).json({
      success: false,
      error: 'Voice cloning failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/voice/status - Get current user's voice settings
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        profileVoiceId: true,
        profileVoiceType: true,
        profileVoiceUrl: true,
        clonedVoiceId: true,
        voiceCloneStatus: true,
        voiceClonedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      voiceData: {
        selectedType: user.profileVoiceType,
        selectedVoiceId: user.profileVoiceId,
        clonedVoiceId: user.clonedVoiceId,
        hasClonedVoice: !!user.clonedVoiceId,
        audioUrl: user.profileVoiceUrl,
        status: user.voiceCloneStatus,
        clonedAt: user.voiceClonedAt
      }
    });
  } catch (error) {
    console.error('Failed to get voice status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve voice status'
    });
  }
});

// GET /api/voice/status/:userId - Check voice cloning status
router.get('/status/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure user can only access their own status
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        profileVoiceId: true,
        profileVoiceType: true,
        profileVoiceUrl: true,
        voiceCloneStatus: true,
        voiceClonedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      voiceData: {
        voiceId: user.profileVoiceId,
        voiceType: user.profileVoiceType,
        audioUrl: user.profileVoiceUrl,
        status: user.voiceCloneStatus,
        clonedAt: user.voiceClonedAt
      }
    });
  } catch (error) {
    console.error('Failed to get voice status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve voice status'
    });
  }
});

// POST /api/voice/preview - Generate voice preview audio
router.post('/preview', auth, async (req, res) => {
  try {
    console.log('🔍 /api/voice/preview body:', req.body);
    console.log('🔍 Content-Type:', req.headers['content-type']);

    const { voiceId, text } = req.body || {};

    if (!voiceId) {
      console.error('❌ Missing voiceId in preview request');
      return res.status(400).json({
        success: false,
        error: 'voiceId is required'
      });
    }

    console.log('🎧 Generating preview for voiceId:', voiceId);

    const sampleText = text || "Hello! I'm excited to discuss my professional experience and career goals with you. I look forward to sharing how my skills and background align with your team's needs.";

    try {
      // Generate speech using Cartesia
      console.log('📡 Calling Cartesia testVoiceSynthesis with:', voiceId);
      const audioBuffer = await cartesiaService.testVoiceSynthesis(voiceId, sampleText);
      console.log('✅ Cartesia returned audio buffer, size:', audioBuffer.byteLength);

      res.set({
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.byteLength,
        'Cache-Control': 'no-cache'
      });

      res.send(Buffer.from(audioBuffer));
    } catch (synthesisError) {
      console.error('Voice synthesis failed:', synthesisError);

      // Return a fallback error response
      res.status(500).json({
        success: false,
        error: 'Voice preview generation failed'
      });
    }
  } catch (error) {
    console.error('Voice preview endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate voice preview'
    });
  }
});

// DELETE /api/voice/reset - Reset voice preferences
router.delete('/reset', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        profileVoiceId: null,
        profileVoiceType: null,
        profileVoiceUrl: null,
        voiceCloneStatus: null,
        voiceClonedAt: null
      }
    });

    res.json({
      success: true,
      message: 'Voice preferences reset successfully'
    });
  } catch (error) {
    console.error('Failed to reset voice preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset voice preferences'
    });
  }
});

module.exports = router;