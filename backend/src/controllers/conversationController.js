const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const AWS = require('aws-sdk');
const axios = require('axios');

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure AWS S3 for audio storage
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

class ConversationController {
  // Start new conversation
  async startConversation(req, res) {
    try {
      const userId = req.user.userId;
      const { recruiterName, recruiterCompany } = req.body;

      // Get user's active voice profile
      const voiceProfile = await prisma.voiceProfile.findFirst({
        where: {
          userId,
          isActive: true
        }
      });

      if (!voiceProfile) {
        return res.status(400).json({
          error: 'No active voice profile found. Please set up a voice profile first.'
        });
      }

      // Create conversation
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          recruiterSessionId: `recruiter_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          recruiterName: recruiterName || 'Anonymous Recruiter',
          recruiterCompany: recruiterCompany || 'Unknown Company',
          status: 'active'
        },
        select: {
          id: true,
          recruiterSessionId: true,
          recruiterName: true,
          recruiterCompany: true,
          conversationStart: true,
          status: true
        }
      });

      res.status(201).json({
        message: 'Conversation started successfully',
        conversation
      });
    } catch (error) {
      console.error('Start conversation error:', error);
      res.status(500).json({
        error: 'Internal server error while starting conversation'
      });
    }
  }

  // Get user's conversations
  async getUserConversations(req, res) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 10 } = req.query;

      const conversations = await prisma.conversation.findMany({
        where: { userId },
        include: {
          messages: {
            orderBy: { messageOrder: 'asc' },
            select: {
              id: true,
              messageType: true,
              messageText: true,
              audioUrl: true,
              messageOrder: true,
              createdAt: true
            }
          }
        },
        orderBy: { conversationStart: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      });

      const total = await prisma.conversation.count({
        where: { userId }
      });

      res.json({
        conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching conversations'
      });
    }
  }

  // Get specific conversation
  async getConversation(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        },
        include: {
          messages: {
            orderBy: { messageOrder: 'asc' },
            select: {
              id: true,
              messageType: true,
              messageText: true,
              audioUrl: true,
              messageOrder: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }

      res.json({ conversation });
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching conversation'
      });
    }
  }

  // Process recruiter message and generate twin response
  async processMessage(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId, messageText, audioData } = req.body;

      // Verify conversation belongs to user
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        }
      });

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }

      // Get user's resume and interview data for context
      const userContext = await this.getUserContext(userId);

      // Generate twin response using RAG system
      const twinResponse = await this.generateTwinResponse(messageText, userContext);

      // Get user's active voice profile
      const voiceProfile = await prisma.voiceProfile.findFirst({
        where: {
          userId,
          isActive: true
        }
      });

      // Generate speech for twin response
      let twinAudioUrl = null;
      if (voiceProfile && twinResponse) {
        twinAudioUrl = await this.generateSpeechForResponse(twinResponse, voiceProfile.humeVoiceId);
      }

      // Save recruiter message
      const recruiterMessage = await prisma.conversationMessage.create({
        data: {
          conversationId,
          messageType: 'recruiter_question',
          messageText,
          audioUrl: audioData ? await this.uploadAudio(audioData, conversationId) : null,
          messageOrder: await this.getNextMessageOrder(conversationId)
        }
      });

      // Save twin response
      const twinMessage = await prisma.conversationMessage.create({
        data: {
          conversationId,
          messageType: 'twin_response',
          messageText: twinResponse,
          audioUrl: twinAudioUrl,
          messageOrder: await this.getNextMessageOrder(conversationId)
        }
      });

      // Update conversation message count
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { totalMessages: conversation.totalMessages + 2 }
      });

      res.json({
        message: 'Message processed successfully',
        recruiterMessage,
        twinResponse: {
          text: twinResponse,
          audioUrl: twinAudioUrl
        }
      });
    } catch (error) {
      console.error('Process message error:', error);
      res.status(500).json({
        error: 'Internal server error while processing message'
      });
    }
  }

  // Get user context for RAG system
  async getUserContext(userId) {
    try {
      // Get latest resume
      const resume = await prisma.resume.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      // Get recent interview responses
      const recentSessions = await prisma.interviewSession.findMany({
        where: { userId },
        include: {
          responses: {
            select: {
              questionText: true,
              responseTranscript: true
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        take: 3
      });

      // Build context string
      let context = '';
      
      if (resume) {
        context += `Resume Information:\n`;
        context += `Skills: ${resume.skills?.join(', ') || 'Not specified'}\n`;
        context += `Experience: ${resume.experienceYears || 0} years\n`;
        context += `Job Titles: ${resume.jobTitles?.join(', ') || 'Not specified'}\n`;
        context += `Raw Text: ${resume.rawText?.substring(0, 1000) || 'No content'}\n\n`;
      }

      if (recentSessions.length > 0) {
        context += `Recent Interview Responses:\n`;
        recentSessions.forEach(session => {
          session.responses.forEach(response => {
            context += `Q: ${response.questionText}\n`;
            context += `A: ${response.responseTranscript || 'No transcript'}\n\n`;
          });
        });
      }

      return context;
    } catch (error) {
      console.error('Get user context error:', error);
      return '';
    }
  }

  // Generate twin response using OpenAI with RAG
  async generateTwinResponse(recruiterMessage, userContext) {
    try {
      const systemPrompt = `You are a digital twin of a job candidate. Respond to recruiter questions in a natural, conversational way based on the candidate's resume and interview responses.

Key guidelines:
- Be authentic and consistent with the candidate's background
- Show enthusiasm and professionalism
- Provide specific examples when possible
- Keep responses concise but informative
- Match the candidate's experience level and skills
- Be honest about limitations while showing confidence

Candidate Context:
${userContext}

Respond as the candidate would, using "I" statements and speaking from their perspective.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: recruiterMessage }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Generate twin response error:', error);
      return "I appreciate your question. Based on my experience and background, I'd be happy to discuss this further. Could you please provide more specific details about what you're looking for?";
    }
  }

  // Generate speech for twin response
  async generateSpeechForResponse(text, voiceId) {
    try {
      const response = await axios.post('https://api.hume.ai/v0/batch/jobs', {
        model: {
          name: 'text-to-speech'
        },
        input: [
          {
            text: text,
            voice_id: voiceId
          }
        ],
        output: {
          format: 'mp3',
          sample_rate: 44100
        }
      }, {
        headers: {
          'X-Hume-Api-Key': process.env.HUME_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      const jobId = response.data.job_id;

      // Poll for completion
      let audioUrl = null;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const statusResponse = await axios.get(`https://api.hume.ai/v0/batch/jobs/${jobId}`, {
          headers: {
            'X-Hume-Api-Key': process.env.HUME_API_KEY
          }
        });

        const status = statusResponse.data.status;

        if (status === 'completed') {
          const results = statusResponse.data.results;
          if (results && results.length > 0 && results[0].audio_url) {
            audioUrl = results[0].audio_url;
            break;
          }
        } else if (status === 'failed') {
          throw new Error('Speech generation failed');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (audioUrl) {
        // Download and upload to S3
        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(audioResponse.data);

        const fileName = `conversations/${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
        
        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: fileName,
          Body: audioBuffer,
          ContentType: 'audio/mpeg',
          ACL: 'private'
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        return uploadResult.Location;
      }

      return null;
    } catch (error) {
      console.error('Generate speech error:', error);
      return null;
    }
  }

  // Upload audio file
  async uploadAudio(audioData, conversationId) {
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      const fileName = `conversations/${conversationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
      
      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: audioBuffer,
        ContentType: 'audio/webm',
        ACL: 'private'
      };

      const uploadResult = await s3.upload(uploadParams).promise();
      return uploadResult.Location;
    } catch (error) {
      console.error('Upload audio error:', error);
      return null;
    }
  }

  // Get next message order
  async getNextMessageOrder(conversationId) {
    const lastMessage = await prisma.conversationMessage.findFirst({
      where: { conversationId },
      orderBy: { messageOrder: 'desc' }
    });

    return (lastMessage?.messageOrder || 0) + 1;
  }

  // End conversation
  async endConversation(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        }
      });

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'ended',
          conversationEnd: new Date()
        }
      });

      res.json({
        message: 'Conversation ended successfully'
      });
    } catch (error) {
      console.error('End conversation error:', error);
      res.status(500).json({
        error: 'Internal server error while ending conversation'
      });
    }
  }

  // Get conversation analytics
  async getConversationAnalytics(req, res) {
    try {
      const userId = req.user.userId;

      const conversations = await prisma.conversation.findMany({
        where: { userId },
        include: {
          messages: {
            select: {
              messageType: true,
              createdAt: true
            }
          }
        }
      });

      const totalConversations = conversations.length;
      const activeConversations = conversations.filter(c => c.status === 'active').length;
      const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
      const averageMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0;

      const messageTypeStats = conversations.reduce((stats, conv) => {
        conv.messages.forEach(msg => {
          stats[msg.messageType] = (stats[msg.messageType] || 0) + 1;
        });
        return stats;
      }, {});

      res.json({
        analytics: {
          totalConversations,
          activeConversations,
          totalMessages,
          averageMessagesPerConversation: Math.round(averageMessagesPerConversation * 10) / 10,
          messageTypeStats
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

module.exports = new ConversationController(); 