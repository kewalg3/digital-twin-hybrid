const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class RecruiterService {
  /**
   * Create or update a recruiter profile
   * @param {Object} recruiterData - Recruiter information
   * @returns {Object} Recruiter record
   */
  async createOrUpdateRecruiter(recruiterData) {
    try {
      const { name, email, title, company, linkedinUrl, phone } = recruiterData;

      console.log('👤 Creating/updating recruiter:', name);

      // If email is provided, try to find existing recruiter
      if (email) {
        const existingRecruiter = await prisma.recruiter.findUnique({
          where: { email }
        });

        if (existingRecruiter) {
          // Update existing recruiter
          console.log('📝 Updating existing recruiter:', existingRecruiter.id);
          return await prisma.recruiter.update({
            where: { id: existingRecruiter.id },
            data: {
              name,
              title,
              company,
              linkedinUrl,
              phone
            }
          });
        }
      }

      // Create new recruiter
      console.log('✨ Creating new recruiter');
      return await prisma.recruiter.create({
        data: {
          name,
          email,
          title,
          company,
          linkedinUrl,
          phone
        }
      });
    } catch (error) {
      console.error('❌ Error creating/updating recruiter:', error);
      throw error;
    }
  }

  /**
   * Link a recruiter to an interview session
   * @param {string} recruiterId - Recruiter ID
   * @param {string} sessionId - EVI Interview Session ID
   * @param {Object} interviewData - Interview specific data (position, jobDescription)
   * @returns {Object} RecruiterInterview record
   */
  async linkRecruiterToInterview(recruiterId, sessionId, interviewData = {}) {
    try {
      const { position, jobDescription, notes } = interviewData;

      console.log('🔗 Linking recruiter to interview:', { recruiterId, sessionId });

      // Check if link already exists
      const existingLink = await prisma.recruiterInterview.findFirst({
        where: {
          recruiterId,
          eviInterviewSessionId: sessionId
        }
      });

      if (existingLink) {
        console.log('📝 Updating existing recruiter interview link');
        return await prisma.recruiterInterview.update({
          where: { id: existingLink.id },
          data: {
            position,
            jobDescription,
            notes
          }
        });
      }

      // Create new link
      console.log('✨ Creating new recruiter interview link');
      return await prisma.recruiterInterview.create({
        data: {
          recruiterId,
          eviInterviewSessionId: sessionId,
          position,
          jobDescription,
          notes
        },
        include: {
          recruiter: true,
          eviInterviewSession: true
        }
      });
    } catch (error) {
      console.error('❌ Error linking recruiter to interview:', error);
      throw error;
    }
  }

  /**
   * Process recruiter context from profile page
   * @param {Object} recruiterContext - Recruiter context from frontend
   * @param {string} sessionId - EVI Interview Session ID
   * @returns {Object} Created/updated recruiter and link
   */
  async processRecruiterContext(recruiterContext, sessionId) {
    try {
      if (!recruiterContext || !recruiterContext.recruiterName) {
        console.log('⚠️ No recruiter context provided');
        return null;
      }

      // Create or update recruiter profile
      const recruiter = await this.createOrUpdateRecruiter({
        name: recruiterContext.recruiterName,
        email: null, // Email not collected in profile page context
        title: recruiterContext.recruiterTitle,
        company: recruiterContext.company,
        linkedinUrl: null,
        phone: null
      });

      // Link recruiter to interview session
      const recruiterInterview = await this.linkRecruiterToInterview(
        recruiter.id,
        sessionId,
        {
          position: recruiterContext.position,
          jobDescription: recruiterContext.jobDescription,
          notes: null
        }
      );

      return {
        recruiter,
        recruiterInterview
      };
    } catch (error) {
      console.error('❌ Error processing recruiter context:', error);
      throw error;
    }
  }

  /**
   * Get recruiter interview history
   * @param {string} recruiterId - Recruiter ID
   * @returns {Array} List of interviews conducted by recruiter
   */
  async getRecruiterInterviews(recruiterId) {
    try {
      console.log('📋 Fetching recruiter interview history:', recruiterId);

      return await prisma.recruiterInterview.findMany({
        where: { recruiterId },
        include: {
          eviInterviewSession: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error('❌ Error fetching recruiter interviews:', error);
      throw error;
    }
  }

  /**
   * Get interview recruiters
   * @param {string} sessionId - EVI Interview Session ID
   * @returns {Array} List of recruiters who conducted this interview
   */
  async getInterviewRecruiters(sessionId) {
    try {
      console.log('📋 Fetching interview recruiters:', sessionId);

      return await prisma.recruiterInterview.findMany({
        where: { eviInterviewSessionId: sessionId },
        include: {
          recruiter: true
        }
      });
    } catch (error) {
      console.error('❌ Error fetching interview recruiters:', error);
      throw error;
    }
  }

  /**
   * Update recruiter notes for an interview
   * @param {string} recruiterId - Recruiter ID
   * @param {string} sessionId - EVI Interview Session ID
   * @param {string} notes - Recruiter notes
   * @returns {Object} Updated RecruiterInterview record
   */
  async updateRecruiterNotes(recruiterId, sessionId, notes) {
    try {
      console.log('📝 Updating recruiter notes');

      const recruiterInterview = await prisma.recruiterInterview.findFirst({
        where: {
          recruiterId,
          eviInterviewSessionId: sessionId
        }
      });

      if (!recruiterInterview) {
        throw new Error('Recruiter interview link not found');
      }

      return await prisma.recruiterInterview.update({
        where: { id: recruiterInterview.id },
        data: { notes }
      });
    } catch (error) {
      console.error('❌ Error updating recruiter notes:', error);
      throw error;
    }
  }
}

module.exports = new RecruiterService();