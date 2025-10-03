const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class InterviewController {
  // Start new interview session
  async startInterview(req, res) {
    try {
      const userId = req.user.userId;
      const { sessionType, resumeId } = req.body;

      if (!['role_specific', 'personality_career'].includes(sessionType)) {
        return res.status(400).json({
          error: 'Invalid session type. Must be "role_specific" or "personality_career"'
        });
      }

      // Get user's latest resume for context
      const resume = await prisma.resume.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      if (!resume) {
        return res.status(400).json({
          error: 'No resume found. Please upload a resume first.'
        });
      }

      // Generate questions based on session type and resume
      const questions = await this.generateQuestions(sessionType, resume);

      // Create interview session
      const session = await prisma.interviewSession.create({
        data: {
          userId,
          sessionType,
          questionsGenerated: questions,
          totalQuestions: questions.length,
          status: 'in_progress'
        },
        select: {
          id: true,
          sessionType: true,
          status: true,
          questionsGenerated: true,
          currentQuestionIndex: true,
          totalQuestions: true,
          startedAt: true
        }
      });

      res.status(201).json({
        message: 'Interview session started successfully',
        session
      });
    } catch (error) {
      console.error('Start interview error:', error);
      res.status(500).json({
        error: 'Internal server error while starting interview'
      });
    }
  }

  // Generate questions using OpenAI
  async generateQuestions(sessionType, resume) {
    try {
      const resumeContext = `
        Skills: ${resume.skills?.join(', ') || 'Not specified'}
        Experience: ${resume.experienceYears || 0} years
        Job Titles: ${resume.jobTitles?.join(', ') || 'Not specified'}
        Raw Text: ${resume.rawText?.substring(0, 1000) || 'No content'}
      `;

      let systemPrompt = '';
      if (sessionType === 'role_specific') {
        systemPrompt = `You are an expert technical interviewer. Generate 10 role-specific technical questions based on the candidate's resume. 
        Focus on their skills, experience level, and job titles. Questions should be appropriate for their experience level.
        Return only a JSON array of question strings, no additional text.`;
      } else {
        systemPrompt = `You are an expert HR interviewer. Generate 10 personality and career-focused questions.
        These should cover: leadership, teamwork, problem-solving, career goals, work style, and behavioral scenarios.
        Return only a JSON array of question strings, no additional text.`;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate questions for this candidate:\n${resumeContext}` }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const questionsText = response.choices[0].message.content;
      let questions;
      
      try {
        questions = JSON.parse(questionsText);
      } catch (parseError) {
        // Fallback to default questions if parsing fails
        questions = sessionType === 'role_specific' 
          ? this.getDefaultTechnicalQuestions()
          : this.getDefaultPersonalityQuestions();
      }

      return Array.isArray(questions) ? questions : [questions];
    } catch (error) {
      console.error('Question generation error:', error);
      // Return default questions if OpenAI fails
      return sessionType === 'role_specific' 
        ? this.getDefaultTechnicalQuestions()
        : this.getDefaultPersonalityQuestions();
    }
  }

  // Default technical questions
  getDefaultTechnicalQuestions() {
    return [
      "Can you walk me through your most challenging technical project?",
      "How do you stay updated with the latest technologies in your field?",
      "Describe a time when you had to debug a complex issue. What was your approach?",
      "How do you handle working with legacy code?",
      "What's your experience with version control systems?",
      "How do you approach code reviews?",
      "Describe your experience with testing methodologies.",
      "How do you handle tight deadlines in technical projects?",
      "What's your experience with cloud platforms?",
      "How do you mentor junior developers?"
    ];
  }

  // Default personality questions
  getDefaultPersonalityQuestions() {
    return [
      "Tell me about a time when you had to work with a difficult team member.",
      "How do you handle stress and pressure in the workplace?",
      "Describe a situation where you had to adapt to significant change.",
      "What motivates you in your work?",
      "How do you prioritize tasks when you have multiple deadlines?",
      "Tell me about a time when you went above and beyond for a project.",
      "How do you handle constructive criticism?",
      "Describe your ideal work environment.",
      "What are your career goals for the next 5 years?",
      "How do you contribute to team collaboration?"
    ];
  }

  // Get current interview session
  async getCurrentSession(req, res) {
    try {
      const userId = req.user.userId;

      const session = await prisma.interviewSession.findFirst({
        where: {
          userId,
          status: 'in_progress'
        },
        include: {
          responses: {
            orderBy: { questionOrder: 'asc' },
            select: {
              id: true,
              questionText: true,
              responseAudioUrl: true,
              responseTranscript: true,
              responseDuration: true,
              questionOrder: true,
              createdAt: true
            }
          }
        }
      });

      if (!session) {
        return res.status(404).json({
          error: 'No active interview session found'
        });
      }

      res.json({ session });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching session'
      });
    }
  }

  // Submit interview response
  async submitResponse(req, res) {
    try {
      const userId = req.user.userId;
      const { sessionId, questionText, audioData, transcript, duration } = req.body;

      // Verify session belongs to user
      const session = await prisma.interviewSession.findFirst({
        where: {
          id: sessionId,
          userId
        }
      });

      if (!session) {
        return res.status(404).json({
          error: 'Interview session not found'
        });
      }

      // Note: Audio files are not currently being stored
      // If needed in the future, can use Supabase storage
      let audioUrl = null;

      // Create response record
      const response = await prisma.interviewResponse.create({
        data: {
          sessionId,
          questionText,
          responseAudioUrl: audioUrl,
          responseTranscript: transcript,
          responseDuration: duration,
          questionOrder: session.currentQuestionIndex
        },
        select: {
          id: true,
          questionText: true,
          responseAudioUrl: true,
          responseTranscript: true,
          responseDuration: true,
          questionOrder: true,
          createdAt: true
        }
      });

      // Update session progress
      const nextQuestionIndex = session.currentQuestionIndex + 1;
      const isCompleted = nextQuestionIndex >= session.totalQuestions;

      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          currentQuestionIndex: nextQuestionIndex,
          status: isCompleted ? 'completed' : 'in_progress',
          completedAt: isCompleted ? new Date() : null
        }
      });

      res.json({
        message: 'Response submitted successfully',
        response,
        isCompleted,
        nextQuestionIndex
      });
    } catch (error) {
      console.error('Submit response error:', error);
      res.status(500).json({
        error: 'Internal server error while submitting response'
      });
    }
  }

  // Get interview history
  async getInterviewHistory(req, res) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 10 } = req.query;

      const sessions = await prisma.interviewSession.findMany({
        where: { userId },
        include: {
          responses: {
            select: {
              id: true,
              questionText: true,
              responseDuration: true,
              questionOrder: true
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      });

      const total = await prisma.interviewSession.count({
        where: { userId }
      });

      res.json({
        sessions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching interview history'
      });
    }
  }

  // Get interview analytics
  async getInterviewAnalytics(req, res) {
    try {
      const userId = req.user.userId;

      const sessions = await prisma.interviewSession.findMany({
        where: { userId },
        include: {
          responses: {
            select: {
              responseDuration: true,
              questionOrder: true
            }
          }
        }
      });

      const totalSessions = sessions.length;
      const completedSessions = sessions.filter(s => s.status === 'completed').length;
      const totalResponses = sessions.reduce((sum, session) => sum + session.responses.length, 0);
      const averageResponseTime = sessions.reduce((sum, session) => {
        const sessionAvg = session.responses.reduce((s, r) => s + (r.responseDuration || 0), 0) / session.responses.length;
        return sum + (isNaN(sessionAvg) ? 0 : sessionAvg);
      }, 0) / totalSessions;

      const sessionTypeStats = sessions.reduce((stats, session) => {
        stats[session.sessionType] = (stats[session.sessionType] || 0) + 1;
        return stats;
      }, {});

      res.json({
        analytics: {
          totalSessions,
          completedSessions,
          completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
          totalResponses,
          averageResponseTime: Math.round(averageResponseTime),
          sessionTypeStats
        }
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching analytics'
      });
    }
  }
}

module.exports = new InterviewController(); 