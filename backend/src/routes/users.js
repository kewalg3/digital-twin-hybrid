const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const prisma = new PrismaClient();

// IMPORTANT: Specific routes must come BEFORE wildcard routes!

// Get public profile by userId - No authentication required
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🔍 Fetching public profile for user:', userId);

    // Fetch user with related data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        city: true,
        state: true,
        country: true,
        linkedinUrl: true,
        // Don't expose email or phone in public profile
        resumes: {
          select: {
            id: true,
            extractedName: true,
            skillsExtracted: true,
            totalExperience: true,
            parsedContent: true,
            professionalSummary: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        experiences: {
          select: {
            id: true,
            jobTitle: true,
            company: true,
            location: true,
            startDate: true,
            endDate: true,
            isCurrentRole: true,
            description: true
          },
          orderBy: { startDate: 'desc' }
        },
        skillsets: {
          select: {
            id: true,
            name: true,
            category: true,
            yearsOfExp: true,
            lastUsed: true,
            source: true
          }
        },
        software: {
          select: {
            id: true,
            name: true,
            category: true,
            yearsOfExp: true,
            lastUsed: true,
            source: true
          }
        },
        eviInterviewSessions: {
          select: {
            id: true,
            jobTitle: true,
            company: true,
            interviewBrief: true,  // This contains the insights!
            achievements: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10  // Get last 10 interviews
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the latest resume data for job title
    const latestResume = user.resumes?.[0];
    
    // Get current or most recent job title from experiences
    const currentExperience = user.experiences?.find(exp => exp.isCurrentRole) || user.experiences?.[0];
    const jobTitle = currentExperience?.jobTitle || 'Professional';

    // Get professional summary directly from the field
    const professionalSummary = latestResume?.professionalSummary || '';

    // Format the response
    const publicProfile = {
      id: user.id,
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle,
      currentCompany: currentExperience?.company,
      location: [user.city, user.state].filter(Boolean).join(', ') || 'Location not specified',
      country: user.country,
      linkedinUrl: user.linkedinUrl,
      totalExperience: latestResume?.totalExperience || 0,
      professionalSummary,
      experiences: user.experiences,
      skills: [
        ...user.skillsets.map(skill => ({ ...skill, type: 'skill' })),
        ...user.software.map(sw => ({ ...sw, type: 'software' }))
      ],
      // Include interview insights for richer context
      interviewInsights: user.eviInterviewSessions || []
    };

    console.log('✅ Public profile fetched successfully for:', userId);
    res.json({ 
      success: true,
      profile: publicProfile 
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get onboarding status
router.get('/onboarding-status', async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      console.error('❌ No userId found in request.user:', req.user);
      return res.status(401).json({ 
        success: false,
        error: 'User authentication required' 
      });
    }

    console.log('🔍 Fetching onboarding status for user:', userId);
    const status = await prisma.onboardingStatus.findUnique({
      where: { userId }
    });

    if (!status) {
      console.log('📝 Creating initial onboarding status for user:', userId);
      const newStatus = await prisma.onboardingStatus.create({
        data: {
          userId,
          completionPercentage: 0,
          currentStep: 'basic_info'
        }
      });
      console.log('✅ Created initial onboarding status:', newStatus);
      return res.json({ status: newStatus });
    }

    console.log('✅ Found existing onboarding status:', status);
    res.json({ status });
  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update onboarding status
router.put('/onboarding-status', async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: 'User authentication required' 
      });
    }
    
    const updateData = req.body;

    const status = await prisma.onboardingStatus.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData
      }
    });

    res.json({
      message: 'Onboarding status updated successfully',
      status
    });
  } catch (error) {
    console.error('Update onboarding status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user info by userId (for testing without auth)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        linkedinUrl: true,
        city: true,
        state: true,
        country: true,
        zipCode: true,
        address: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user info by userId (for testing without auth)
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      linkedinProfile,
      githubProfile,
      portfolioWebsite,
      twitterProfile,
      phoneCountry
    } = req.body;

    // Combine first and last name for the name field
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        fullName: fullName,
        email: email || undefined,
        phone: phone || undefined,
        linkedinUrl: linkedinProfile || undefined,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        zipCode: zipCode || undefined,
        address: address || undefined
      }
    });

    // Update onboarding status
    await prisma.onboardingStatus.upsert({
      where: { userId },
      update: {
        basicInfoCompleted: true,
        completionPercentage: Math.max(40, 60),
        currentStep: 'experience'
      },
      create: {
        userId,
        basicInfoCompleted: true,
        completionPercentage: 60,
        currentStep: 'experience'
      }
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        onboardingStatus: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      linkedinUrl,
      portfolioUrl,
      githubUrl,
      twitterUrl,
      websiteUrl
    } = req.body;

    // Update or create user profile
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        linkedinUrl,
        portfolioUrl,
        githubUrl,
        twitterUrl,
        websiteUrl,
        profileComplete: true
      },
      create: {
        userId,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        linkedinUrl,
        portfolioUrl,
        githubUrl,
        twitterUrl,
        websiteUrl,
        profileComplete: true
      }
    });

    // Update onboarding status
    await prisma.onboardingStatus.upsert({
      where: { userId },
      update: {
        basicInfoCompleted: true,
        completionPercentage: Math.max(20, 60), // At least 20%, up to 60%
        currentStep: 'experience'
      },
      create: {
        userId,
        basicInfoCompleted: true,
        completionPercentage: 20,
        currentStep: 'experience'
      }
    });

    res.json({
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// LIVEKIT AGENT ENDPOINTS (No Auth Required)
// ==========================================

// Get comprehensive resume data for agent function calling
router.get('/:userId/resume-data', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🤖 Agent fetching resume data for user:', userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        country: true,
        linkedinUrl: true,
        resumes: {
          select: {
            id: true,
            extractedName: true,
            skillsExtracted: true,
            totalExperience: true,
            parsedContent: true,
            professionalSummary: true,
            educationInfo: true,
            contactInfo: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        personal: {
          name: user.fullName,
          email: user.email,
          phone: user.phone,
          location: `${user.city}, ${user.state}, ${user.country}`,
          linkedin: user.linkedinUrl
        },
        resume: user.resumes[0] || null,
        hasResume: user.resumes.length > 0
      }
    });

  } catch (error) {
    console.error('❌ Agent resume data fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch resume data' });
  }
});

// Get detailed work experiences for agent
router.get('/:userId/experiences', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🤖 Agent fetching experiences for user:', userId);

    const experiences = await prisma.experience.findMany({
      where: { userId: userId },
      select: {
        id: true,
        jobTitle: true,
        company: true,
        location: true,
        startDate: true,
        endDate: true,
        isCurrentRole: true,
        description: true,
        achievements: true,
        skills: true,
        software: true,
        aiEnhancedAchievements: true
      },
      orderBy: { startDate: 'desc' }
    });

    res.json({
      success: true,
      data: experiences.map(exp => ({
        ...exp,
        duration: calculateDuration(exp.startDate, exp.endDate, exp.isCurrentRole),
        skills: exp.skills || [],
        software: exp.software || [],
        achievements: exp.achievements || []
      }))
    });

  } catch (error) {
    console.error('❌ Agent experiences fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch experiences' });
  }
});

// Get skills information for agent
router.get('/:userId/skills', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🤖 Agent fetching skills for user:', userId);

    const skillsets = await prisma.skillset.findMany({
      where: { userId: userId },
      include: {
        skills: {
          select: {
            id: true,
            name: true,
            proficiencyLevel: true,
            category: true,
            isEndorsed: true
          }
        }
      }
    });

    const software = await prisma.software.findMany({
      where: { userId: userId },
      select: {
        id: true,
        name: true,
        proficiencyLevel: true,
        category: true,
        versions: true
      }
    });

    res.json({
      success: true,
      data: {
        skillsets: skillsets,
        software: software,
        summary: {
          totalSkills: skillsets.reduce((acc, skillset) => acc + skillset.skills.length, 0),
          totalSoftware: software.length,
          categories: [...new Set([
            ...skillsets.flatMap(s => s.skills.map(skill => skill.category)),
            ...software.map(s => s.category)
          ])].filter(Boolean)
        }
      }
    });

  } catch (error) {
    console.error('❌ Agent skills fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Helper function to calculate duration
function calculateDuration(startDate, endDate, isCurrent) {
  const start = new Date(startDate);
  const end = isCurrent ? new Date() : new Date(endDate);

  const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 +
                   (end.getMonth() - start.getMonth());

  const years = Math.floor(monthDiff / 12);
  const months = monthDiff % 12;

  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  } else if (months === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
  }
}


module.exports = router;