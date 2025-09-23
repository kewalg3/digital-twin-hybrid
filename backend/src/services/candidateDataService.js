const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class CandidateDataService {
  /**
   * Get unified candidate data for digital twin
   * @param {string} userId - The candidate's user ID
   * @returns {Object} Unified candidate data structure
   */
  async getUnifiedCandidateData(userId) {
    try {
      console.log('🔍 Gathering unified candidate data for user:', userId);

      // Fetch user with all related data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          resumes: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          experiences: {
            orderBy: { startDate: 'desc' }
          },
          skillsets: true,
          software: true,
          eviInterviewSessions: {
            where: { 
              achievements: { not: null }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Extract resume parsed data
      const latestResume = user.resumes[0];
      const resumeData = {
        parsedContent: latestResume?.parsedContent || {},
        extractedSkills: latestResume?.skillsExtracted || [],
        totalExperience: latestResume?.totalExperience || 0,
        industryType: latestResume?.industryType || ''
      };

      // Process interview sessions by type
      const interviewInsights = {
        experienceEnhancement: [],
        workStyle: [],
        allAchievements: []
      };

      user.eviInterviewSessions.forEach(session => {
        const sessionInsight = {
          jobTitle: session.jobTitle,
          company: session.company,
          duration: session.duration,
          achievements: session.achievements || {},
          sessionDate: session.createdAt
        };

        // Categorize by interview type
        if (session.interviewType === 'job_experience') {
          interviewInsights.experienceEnhancement.push(sessionInsight);
        } else if (session.interviewType === 'work_style') {
          interviewInsights.workStyle.push(sessionInsight);
        }

        // Collect all achievements
        if (session.achievements?.achievements) {
          interviewInsights.allAchievements.push(...session.achievements.achievements);
        }
      });

      // Build comprehensive skills profile with proficiency
      const skillsProfile = this.mergeSkillsData(
        user.skillsets,
        user.software,
        resumeData.extractedSkills
      );

      // Extract education and certifications from parsed content
      const education = resumeData.parsedContent.education || [];
      const certifications = resumeData.parsedContent.certifications || [];

      // Build experience timeline with enriched data
      const experienceTimeline = this.buildExperienceTimeline(
        user.experiences,
        interviewInsights.experienceEnhancement
      );

      // Total years of experience (already in years from Text Kernel)
      const totalExperienceYears = resumeData.totalExperience || 0;

      // Return unified data structure
      return {
        personalInfo: {
          id: user.id,
          fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          firstName: user.firstName,
          lastName: user.lastName,
          location: [user.city, user.state, user.country].filter(Boolean).join(', '),
          email: user.email,
          phone: user.phone,
          linkedinUrl: user.linkedinUrl,
          totalExperienceYears
        },
        resumeData,
        education,
        certifications,
        experienceTimeline,
        skillsProfile,
        interviewInsights,
        professionalSummary: resumeData.parsedContent.professionalSummary || '',
        industryType: resumeData.industryType
      };
    } catch (error) {
      console.error('❌ Error gathering candidate data:', error);
      throw error;
    }
  }

  /**
   * Merge skills data from different sources
   */
  mergeSkillsData(skillsets, software, extractedSkills) {
    const skillMap = new Map();

    // Add skillsets (technical skills)
    skillsets.forEach(skill => {
      skillMap.set(skill.name.toLowerCase(), {
        name: skill.name,
        type: 'skill',
        category: skill.category,
        yearsOfExp: skill.yearsOfExp || 0,
        lastUsed: skill.lastUsed,
        source: skill.source,
        proficiencyLevel: this.calculateProficiencyLevel(skill.yearsOfExp)
      });
    });

    // Add software/tools
    software.forEach(sw => {
      skillMap.set(sw.name.toLowerCase(), {
        name: sw.name,
        type: 'software',
        category: sw.category,
        yearsOfExp: sw.yearsOfExp || 0,
        lastUsed: sw.lastUsed,
        source: sw.source,
        proficiencyLevel: this.calculateProficiencyLevel(sw.yearsOfExp)
      });
    });

    // Add any skills from resume that aren't already included
    extractedSkills.forEach(skillName => {
      const key = skillName.toLowerCase();
      if (!skillMap.has(key)) {
        skillMap.set(key, {
          name: skillName,
          type: 'skill',
          category: 'general',
          yearsOfExp: 0,
          lastUsed: 'Unknown',
          source: 'resume',
          proficiencyLevel: 'familiar'
        });
      }
    });

    // Convert to array and sort by years of experience
    return Array.from(skillMap.values())
      .sort((a, b) => (b.yearsOfExp || 0) - (a.yearsOfExp || 0));
  }

  /**
   * Calculate proficiency level based on years of experience
   */
  calculateProficiencyLevel(yearsOfExp) {
    if (!yearsOfExp || yearsOfExp === 0) return 'familiar';
    if (yearsOfExp < 2) return 'beginner';
    if (yearsOfExp < 5) return 'proficient';
    return 'expert';
  }

  /**
   * Build enriched experience timeline
   */
  buildExperienceTimeline(experiences, interviewEnhancements) {
    return experiences.map(exp => {
      // Find matching interview insights for this experience
      const matchingInsights = interviewEnhancements.filter(
        insight => insight.company.toLowerCase() === exp.company.toLowerCase()
      );

      // Collect all achievements for this role
      const roleAchievements = [];
      matchingInsights.forEach(insight => {
        if (insight.achievements?.achievements) {
          roleAchievements.push(...insight.achievements.achievements);
        }
      });

      return {
        ...exp,
        enrichedAchievements: roleAchievements,
        hasInterviewData: matchingInsights.length > 0
      };
    });
  }
}

module.exports = new CandidateDataService();