const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Validation middleware
const validateOnboardingUpdate = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('step').isIn(['basic_info', 'resume', 'experience', 'skills', 'profile']).withMessage('Invalid step'),
  body('data').isObject().withMessage('Data must be an object')
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
 * GET /api/onboarding/status/:userId
 * Get user's onboarding progress and data
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user data with all relations
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        resumes: {
          orderBy: { createdAt: 'desc' },
          take: 1 // Get latest resume
        },
        experiences: {
          orderBy: { displayOrder: 'asc' }
        },
        skills: {
          orderBy: { createdAt: 'desc' }
        },
        onboardingStatus: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Create onboarding status if it doesn't exist
    let onboardingStatus = user.onboardingStatus;
    if (!onboardingStatus) {
      onboardingStatus = await prisma.onboardingStatus.create({
        data: { userId }
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          city: user.city,
          state: user.state,
          country: user.country,
          zipCode: user.zipCode,
          address: user.address,
          linkedinUrl: user.linkedinUrl
        },
        latestResume: user.resumes[0] || null,
        experiences: user.experiences,
        skills: user.skills,
        onboardingStatus
      }
    });

  } catch (error) {
    console.error('❌ Error fetching onboarding status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch onboarding status',
      details: error.message
    });
  }
});

/**
 * POST /api/onboarding/update
 * Update onboarding data and progress
 */
router.post('/update', validateOnboardingUpdate, handleValidationErrors, async (req, res) => {
  try {
    const { userId, step, data } = req.body;
    console.log(`🎯 Updating onboarding step: ${step} for user: ${userId}`);

    let updatedData = {};
    let progressUpdate = {};

    switch (step) {
      case 'basic_info':
        // Update user basic information
        updatedData = await prisma.user.update({
          where: { id: userId },
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            fullName: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null,
            phone: data.phone,
            city: data.city,
            state: data.state,
            country: data.country,
            zipCode: data.zipCode,
            address: data.address,
            linkedinUrl: data.linkedinProfile
          }
        });

        progressUpdate = {
          basicInfoCompleted: true,
          currentStep: 'resume',
          completionPercentage: 20
        };
        break;

      case 'resume':
        // Resume upload is handled by separate endpoint
        // This just marks the step as complete
        progressUpdate = {
          resumeUploaded: true,
          resumeUploadedAt: new Date(),
          currentStep: 'experience',
          completionPercentage: 40
        };
        break;

      case 'experience':
        // Experiences are managed separately
        // This marks the review as complete
        progressUpdate = {
          experienceCompleted: true,
          experienceCompletedAt: new Date(),
          currentStep: 'skills',
          completionPercentage: 60
        };
        break;

      case 'skills':
        // Skills are managed separately
        // This marks the review as complete
        progressUpdate = {
          skillsCompleted: true,
          skillsCompletedAt: new Date(),
          currentStep: 'profile',
          completionPercentage: 80
        };
        break;

      case 'profile':
        // Final profile completion
        await prisma.user.update({
          where: { id: userId },
          data: {
            profileComplete: true
          }
        });

        progressUpdate = {
          profileCompleted: true,
          profileCompletedAt: new Date(),
          currentStep: 'completed',
          completionPercentage: 100
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid step provided'
        });
    }

    // Update onboarding status
    const onboardingStatus = await prisma.onboardingStatus.upsert({
      where: { userId },
      create: {
        userId,
        ...progressUpdate
      },
      update: progressUpdate
    });

    res.json({
      success: true,
      message: `Successfully updated ${step} step`,
      data: {
        onboardingStatus,
        userData: updatedData
      }
    });

  } catch (error) {
    console.error('❌ Error updating onboarding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update onboarding data',
      details: error.message
    });
  }
});

/**
 * POST /api/onboarding/resume/parse
 * Handle resume upload and parsing
 */
router.post('/resume/parse', async (req, res) => {
  try {
    const { userId, resumeId } = req.body;

    // Get the resume
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      include: { user: true }
    });

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    // Update parsing status (actual parsing logic would go here)
    const updatedResume = await prisma.resume.update({
      where: { id: resumeId },
      data: {
        parsingStatus: 'completed'
      }
    });

    // Update onboarding progress
    await prisma.onboardingStatus.upsert({
      where: { userId },
      create: {
        userId,
        resumeParsed: true,
        currentStep: 'experience',
        completionPercentage: 40
      },
      update: {
        resumeParsed: true
      }
    });

    res.json({
      success: true,
      message: 'Resume parsing completed',
      data: updatedResume
    });

  } catch (error) {
    console.error('❌ Error parsing resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse resume',
      details: error.message
    });
  }
});

/**
 * GET /api/onboarding/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Onboarding service is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;