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
      ]
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


module.exports = router;