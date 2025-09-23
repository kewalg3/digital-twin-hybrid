const { PrismaClient } = require('@prisma/client');
const supabaseStorageService = require('../services/supabaseStorageService');
const textKernelService = require('../services/textKernelService');
const fallbackResumeParser = require('../services/fallbackResumeParser');

const prisma = new PrismaClient();

class ResumeController {
  // Upload resume file
  async uploadResume(req, res) {
    if (!req.files || !req.files.resume) {
      return res.status(400).json({ 
        success: false,
        error: 'No resume file provided' 
      });
    }

    try {
      // Validate authenticated user
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required. Please log in to upload a resume.'
        });
      }
      
      if (!req.files || !req.files.resume) {
        return res.status(400).json({
          success: false,
          error: 'No resume file provided'
        });
      }

      const file = req.files.resume;
      
      // Validate file type and size
      if (!supabaseStorageService.validateFileType(file.name)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'
        });
      }

      if (!supabaseStorageService.validateFileSize(file.size)) {
        return res.status(400).json({
          success: false,
          error: 'File size too large. Maximum size is 10MB.'
        });
      }

      // Upload to Supabase storage (temporarily use local URL while we fix Supabase)
      const uploadResult = {
        filename: `${userId}/${Date.now()}-${file.name}`,
        originalFilename: file.name,
        fileUrl: `http://localhost:3001/uploads/${file.name}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date()
      };

      
      // Parse resume using TextKernel service with fallback
      let parsedData;
      let parsingMethod = 'textkernel';
      
      try {
        parsedData = await textKernelService.parseResume(file.data, file.name);
      } catch (parseError) {
        console.error('TextKernel parsing failed:', parseError.message);
        
        // Check if it's a rate limit error for better user messaging
        if (parseError.message === 'TEXTKERNEL_RATE_LIMIT') {
          console.log('🔄 Using fallback parser due to TextKernel rate limit');
        }
        
        try {
          parsedData = await fallbackResumeParser.parseResume(file.data, file.name);
          parsingMethod = 'fallback';
        } catch (fallbackError) {
          console.error('Fallback parsing also failed:', fallbackError.message);
          
          // Return user-friendly error
          if (file.size > 10 * 1024 * 1024) {
            throw new Error('File too large. Please upload a resume under 10MB.');
          } else if (!file.name.match(/\.(pdf|doc|docx)$/i)) {
            throw new Error('Invalid file format. Please upload a PDF or Word document.');
          } else {
            throw new Error('Unable to parse resume. Please ensure it\'s a valid PDF or Word document with text content.');
          }
        }
      }

      // Save to database with comprehensive parsed data
      const resume = await prisma.resume.create({
        data: {
          userId,
          originalFilename: uploadResult.originalFilename,
          fileUrl: uploadResult.fileUrl,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType,
          parsedContent: parsedData.parsedContent,
          rawText: parsedData.rawText?.replace(/\u0000/g, '') || '',
          extractedName: parsedData.extractedName,
          extractedEmail: parsedData.extractedEmail,
          extractedPhone: parsedData.extractedPhone,
          extractedAddress: parsedData.extractedAddress,
          extractedLinkedIn: parsedData.parsedContent?.personalInfo?.linkedinUrl || null,
          extractedCity: parsedData.parsedContent?.personalInfo?.city,
          extractedState: parsedData.parsedContent?.personalInfo?.state,
          extractedCountry: parsedData.parsedContent?.personalInfo?.country,
          extractedZipCode: parsedData.parsedContent?.personalInfo?.zipCode,
          skillsExtracted: parsedData.skillsExtracted,
          totalExperience: parsedData.totalExperience,
          industryType: parsedData.industryType,
          professionalSummary: parsedData.professionalSummary || null,
          parsingStatus: 'completed'
        },
        select: {
          id: true,
          originalFilename: true,
          fileUrl: true,
          parsedContent: true,
          extractedName: true,
          extractedEmail: true,
          extractedPhone: true,
          extractedAddress: true,
          extractedLinkedIn: true,
          extractedCity: true,
          extractedState: true,
          extractedCountry: true,
          extractedZipCode: true,
          skillsExtracted: true,
          totalExperience: true,
          createdAt: true
        }
      });

      // Update user with personal information from parsed resume (keep last updated data)
      const updateData = {};
      
      // Use extracted data from Resume table (more reliable than parsedContent)
      if (parsedData.extractedName) {
        const nameParts = parsedData.extractedName.split(' ');
        updateData.firstName = nameParts[0];
        updateData.lastName = nameParts.slice(1).join(' ') || null;
        updateData.fullName = parsedData.extractedName;
      }
      
      if (parsedData.extractedPhone) {
        updateData.phone = parsedData.extractedPhone;
      }
      
      if (parsedData.extractedLinkedIn || parsedData.parsedContent?.personalInfo?.linkedinUrl) {
        updateData.linkedinUrl = parsedData.extractedLinkedIn || parsedData.parsedContent?.personalInfo?.linkedinUrl;
      }
      
      if (parsedData.extractedCity || parsedData.parsedContent?.personalInfo?.city) {
        updateData.city = parsedData.extractedCity || parsedData.parsedContent?.personalInfo?.city;
      }
      
      if (parsedData.extractedState || parsedData.parsedContent?.personalInfo?.state) {
        updateData.state = parsedData.extractedState || parsedData.parsedContent?.personalInfo?.state;
      }
      
      if (parsedData.extractedCountry || parsedData.parsedContent?.personalInfo?.country) {
        updateData.country = parsedData.extractedCountry || parsedData.parsedContent?.personalInfo?.country;
      }
      
      if (parsedData.extractedZipCode || parsedData.parsedContent?.personalInfo?.zipCode) {
        updateData.zipCode = parsedData.extractedZipCode || parsedData.parsedContent?.personalInfo?.zipCode;
      }
      
      if (parsedData.extractedAddress || parsedData.parsedContent?.personalInfo?.address) {
        updateData.address = parsedData.extractedAddress || parsedData.parsedContent?.personalInfo?.address;
      }
      
      // Only update if we have extracted data to save
      if (Object.keys(updateData).length > 0) {
        console.log('📝 Updating User table with extracted personal info:', updateData);
        await prisma.user.update({
          where: { id: userId },
          data: updateData
        });
      }

      // Save parsed experiences to Experience table
      if (parsedData.parsedContent?.experiences?.length > 0) {
        // Delete existing parsed experiences for this user
        await prisma.experience.deleteMany({
          where: {
            userId,
            source: 'resume_parsed'
          }
        });
        
        // Save new experiences
        await prisma.experience.createMany({
          data: parsedData.parsedContent.experiences.map(exp => ({
            userId,
            jobTitle: exp.jobTitle,
            company: exp.company,
            location: exp.location,
            startDate: exp.startDate ? new Date(exp.startDate) : new Date('1900-01-01'), // Required field fallback
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            isCurrentRole: exp.isCurrentRole,
            description: exp.description,
            achievements: [],
            keySkills: [],
            displayOrder: exp.displayOrder,
            source: 'resume_parsed'
          }))
        });
      }

      // Save parsed skills to Skillset and Software tables (remove Skills table duplication)
      if (parsedData.parsedContent?.skills?.length > 0) {
        // Delete existing parsed skills and software for this user
        await prisma.skillset.deleteMany({
          where: {
            userId,
            source: 'resume_parsed'
          }
        });
        
        await prisma.software.deleteMany({
          where: {
            userId,
            source: 'resume_parsed'
          }
        });
        
        // Categorize skills into skillsets vs software
        const skillsData = [];
        const softwareData = [];

        parsedData.parsedContent.skills.forEach(skill => {
          const skillLower = skill?.name?.toLowerCase() || '';
          const softwareKeywords = [
            // Development & Tech
            'git', 'docker', 'aws', 'node.js', 'react', 'vue', 'webpack', 'jenkins', 'kubernetes',
            // Business & Analytics  
            'excel', 'power bi', 'tableau', 'anaplan', 'sap', 'sql', 'adaptive insights',
            'powerbi', 'microsoft excel', 'sap applications', 'sql databases',
            // Collaboration & Design
            'jira', 'slack', 'figma', 'photoshop', 'illustrator', 'confluence',
            // Other Business Software
            'salesforce', 'hubspot', 'quickbooks', 'oracle', 'dynamics', 'workday'
          ];
          
          if (softwareKeywords.some(keyword => skillLower.includes(keyword))) {
            // Add to software table
            softwareData.push({
              userId,
              name: skill?.name || '',
              category: skill?.category || 'development_tools',
              subcategory: skill?.subcategory || null,
              yearsOfExp: Math.floor((skill?.monthsExperience || 0) / 12),
              lastUsed: skill?.lastUsed ? new Date(skill.lastUsed) : null,
              source: 'resume_parsed'
            });
          } else {
            // Add to skillset table
            skillsData.push({
              userId,
              name: skill?.name || '',
              category: skill?.category || 'technical',
              subcategory: skill?.subcategory || null,
              yearsOfExp: Math.floor((skill?.monthsExperience || 0) / 12),
              lastUsed: skill?.lastUsed ? new Date(skill.lastUsed) : null,
              source: 'resume_parsed'
            });
          }
        });

        // Save skillsets
        if (skillsData.length > 0) {
          await prisma.skillset.createMany({
            data: skillsData
          });
        }

        // Save software
        if (softwareData.length > 0) {
          await prisma.software.createMany({
            data: softwareData
          });
        }
      }

      // Update onboarding status
      await prisma.onboardingStatus.upsert({
        where: { userId },
        update: {
          resumeUploaded: true,
          resumeParsed: true,
          completionPercentage: 40,
          currentStep: 'experience',
          resumeUploadedAt: new Date()
        },
        create: {
          userId,
          resumeUploaded: true,
          resumeParsed: true,
          completionPercentage: 40,
          currentStep: 'experience',
          resumeUploadedAt: new Date()
        }
      });

      res.status(201).json({
        success: true,
        message: 'Resume uploaded and parsed successfully',
        resume,
        onboardingProgress: {
          currentStep: 'experience',
          completionPercentage: 40
        }
      });
    } catch (error) {
      console.error('❌ Resume upload error:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      // Update parsing status to failed
      const errorUserId = req.user?.userId;
      if (errorUserId) {
        try {
          await prisma.resume.updateMany({
            where: {
              userId: errorUserId,
              parsingStatus: 'pending'
            },
            data: {
              parsingStatus: 'failed',
              parsingError: error.message
            }
          });
        } catch (dbError) {
          console.error('Failed to update resume status:', dbError);
        }
      }
      
      // Return appropriate error status and user-friendly message
      let statusCode = 500;
      let errorMessage = error.message;
      
      if (error.message.includes('authentication failed')) {
        statusCode = 503;
        errorMessage = 'Resume parsing service is temporarily unavailable. Please try again later.';
      } else if (error.message.includes('Invalid file') || error.message.includes('Invalid document')) {
        statusCode = 400;
      } else if (error.message.includes('File too large')) {
        statusCode = 413;
      } else if (error.message.includes('rate limit') || error.message === 'TEXTKERNEL_RATE_LIMIT') {
        statusCode = 200; // Don't show as error since fallback should work
        errorMessage = 'Resume processed using fallback parser due to high traffic.';
      }
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }


  // Get user's resumes
  async getUserResumes(req, res) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const resumes = await prisma.resume.findMany({
        where: { userId },
        select: {
          id: true,
          originalFilename: true,
          fileUrl: true,
          skillsExtracted: true,
          totalExperience: true,
          parsedContent: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ 
        success: true,
        resumes 
      });
    } catch (error) {
      console.error('Get resumes error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching resumes'
      });
    }
  }

  // Get specific resume
  async getResume(req, res) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      const { resumeId } = req.params;

      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId
        },
        select: {
          id: true,
          originalFilename: true,
          fileUrl: true,
          parsedContent: true,
          rawText: true,
          skillsExtracted: true,
          totalExperience: true,
          createdAt: true
        }
      });

      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found'
        });
      }

      res.json({ 
        success: true,
        resume 
      });
    } catch (error) {
      console.error('Get resume error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching resume'
      });
    }
  }

  // Delete resume
  async deleteResume(req, res) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      const { resumeId } = req.params;

      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId
        }
      });

      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found'
        });
      }

      // Delete from Supabase storage
      try {
        const filename = resume.fileUrl.split('/').pop();
        await supabaseStorageService.deleteResume(filename);
      } catch (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from database
      await prisma.resume.delete({
        where: { id: resumeId }
      });

      res.json({
        success: true,
        message: 'Resume deleted successfully'
      });
    } catch (error) {
      console.error('Delete resume error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while deleting resume'
      });
    }
  }

  // Get resume analytics
  async getResumeAnalytics(req, res) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const resumes = await prisma.resume.findMany({
        where: { userId },
        select: {
          skillsExtracted: true,
          totalExperience: true,
          parsedContent: true
        }
      });

      // Aggregate skills
      const allSkills = resumes.flatMap(resume => resume.skillsExtracted || []);
      const skillFrequency = {};
      allSkills.forEach(skill => {
        skillFrequency[skill] = (skillFrequency[skill] || 0) + 1;
      });

      // Get top skills
      const topSkills = Object.entries(skillFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([skill, count]) => ({ skill, count }));

      // Calculate average experience
      const totalExperienceSum = resumes.reduce((sum, resume) => sum + (resume.totalExperience || 0), 0);
      const averageExperience = resumes.length > 0 ? totalExperienceSum / resumes.length : 0;

      // Get unique job titles from parsed content
      const allJobTitles = resumes.flatMap(resume => 
        resume.parsedContent?.workExperience?.map(exp => exp.jobTitle) || []
      );
      const uniqueJobTitles = [...new Set(allJobTitles.filter(title => title))];

      res.json({
        success: true,
        analytics: {
          totalResumes: resumes.length,
          topSkills,
          averageExperience: Math.round(averageExperience * 10) / 10,
          uniqueJobTitles,
          skillFrequency
        }
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching analytics'
      });
    }
  }
}

module.exports = new ResumeController(); 