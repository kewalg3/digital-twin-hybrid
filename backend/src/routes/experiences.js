const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Get all experiences for a specific user by userId (not requiring auth middleware)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const experiences = await prisma.experience.findMany({
      where: { userId },
      orderBy: [
        { createdAt: 'desc' }, // Latest resume parsing data first
        { displayOrder: 'asc' }  // Then manual entries by display order
      ],
      select: {
        id: true,
        jobTitle: true,
        company: true,
        location: true,
        employmentType: true,
        startDate: true,
        endDate: true,
        isCurrentRole: true,
        description: true,
        achievements: true,
        keySkills: true,
        displayOrder: true,
        source: true,
        createdAt: true
      }
    });

    res.json({ experiences });
  } catch (error) {
    console.error('Get experiences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user experiences (authenticated route)
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const experiences = await prisma.experience.findMany({
      where: { userId },
      orderBy: [
        { createdAt: 'desc' }, // Latest resume parsing data first
        { displayOrder: 'asc' }  // Then manual entries by display order
      ]
    });

    res.json({ experiences });
  } catch (error) {
    console.error('Get experiences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get interview completion status for user's experiences
router.get('/:userId/interview-status', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all experiences with their interview sessions
    const experiences = await prisma.experience.findMany({
      where: { userId },
      include: {
        interviews: {
          where: {
            sessionEndTime: { not: null } // Only completed interviews
          },
          select: {
            id: true,
            sessionEndTime: true,
            createdAt: true
          }
        }
      }
    });

    // Map to include completion status
    const experiencesWithStatus = experiences.map(exp => ({
      experienceId: exp.id,
      hasCompletedInterview: exp.interviews.length > 0,
      interviewCount: exp.interviews.length,
      lastInterviewDate: exp.interviews[0]?.createdAt || null
    }));

    res.json({ 
      success: true,
      experiences: experiencesWithStatus 
    });
  } catch (error) {
    console.error('Get interview status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get work style interview completion status for a user
router.get('/:userId/work-style-interview-status', async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user has completed work style interview
    // Work style interviews have NULL experienceId and interviewType = 'work_style'
    const workStyleInterview = await prisma.eVIInterviewSession.findFirst({
      where: {
        userId,
        experienceId: null,
        interviewType: 'work_style',
        sessionEndTime: { not: null } // Only completed interviews
      },
      orderBy: {
        createdAt: 'desc' // Get the latest one
      },
      select: {
        id: true,
        sessionEndTime: true,
        createdAt: true
      }
    });

    res.json({ 
      success: true,
      hasCompletedWorkStyleInterview: !!workStyleInterview,
      lastInterviewDate: workStyleInterview?.createdAt || null
    });
  } catch (error) {
    console.error('Get work style interview status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new experience
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.userId || req.body.userId; // Support both auth and non-auth for flexibility
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const {
      jobTitle,
      company,
      location,
      employmentType,
      startDate,
      endDate,
      isCurrentRole,
      description,
      achievements,
      keySkills,
      source = 'manual'
    } = req.body;

    // Validation
    if (!jobTitle || !company || !startDate) {
      return res.status(400).json({ 
        error: 'Job title, company, and start date are required' 
      });
    }

    const experience = await prisma.experience.create({
      data: {
        userId,
        jobTitle,
        company,
        location,
        employmentType,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isCurrentRole: isCurrentRole || false,
        description: description || '',
        achievements: achievements || [],
        keySkills: keySkills || [],
        source
      }
    });

    res.status(201).json({ 
      message: 'Experience created successfully',
      experience 
    });
  } catch (error) {
    console.error('Create experience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update experience
router.put('/:experienceId', async (req, res) => {
  try {
    const { experienceId } = req.params;
    const { userId, ...updateData } = req.body;

    // Find and verify ownership
    const experience = await prisma.experience.findFirst({
      where: {
        id: experienceId,
        userId: userId || req.user?.userId
      }
    });

    if (!experience) {
      return res.status(404).json({ error: 'Experience not found' });
    }

    // Convert dates if provided
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const updatedExperience = await prisma.experience.update({
      where: { id: experienceId },
      data: updateData
    });

    res.json({ 
      message: 'Experience updated successfully',
      experience: updatedExperience 
    });
  } catch (error) {
    console.error('Update experience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete experience
router.delete('/:experienceId', async (req, res) => {
  try {
    const { experienceId } = req.params;
    const userId = req.user?.userId || req.body.userId;

    // Find and verify ownership
    const experience = await prisma.experience.findFirst({
      where: {
        id: experienceId,
        userId
      }
    });

    if (!experience) {
      return res.status(404).json({ error: 'Experience not found' });
    }

    await prisma.experience.delete({
      where: { id: experienceId }
    });

    res.json({ message: 'Experience deleted successfully' });
  } catch (error) {
    console.error('Delete experience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update interview status and enriched data - DISABLED until schema supports these fields
// router.patch('/:experienceId/interview', async (req, res) => {
//   try {
//     const { experienceId } = req.params;
//     const { userId, interviewCompleted, enrichedData } = req.body;

//     // Find and update the experience
//     const experience = await prisma.experience.findFirst({
//       where: {
//         id: experienceId,
//         userId
//       }
//     });

//     if (!experience) {
//       return res.status(404).json({ error: 'Experience not found' });
//     }

//     const updatedExperience = await prisma.experience.update({
//       where: { id: experienceId },
//       data: {
//         interviewCompleted,
//         enrichedData,
//         interviewCompletedAt: interviewCompleted ? new Date() : null
//       }
//     });

//     res.json({
//       message: 'Interview status updated successfully',
//       experience: updatedExperience
//     });
//   } catch (error) {
//     console.error('Update interview status error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

module.exports = router;