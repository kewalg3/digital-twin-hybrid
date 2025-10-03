const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

// Constants
const WORK_STYLE_EXPERIENCE_ID = 'work-style-interview';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Supabase for file storage (optional for now)
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
} catch (error) {
  console.warn('⚠️ Supabase not configured for file storage');
}

class EVIInterviewService {
  
  /**
   * Process completed EVI interview and extract achievements
   */
  async processCompletedInterview(sessionData) {
    try {
      console.log('🎯 Processing completed EVI interview:', sessionData.sessionId);
      
      const {
        sessionId,
        userId,
        experienceId,
        jobTitle,
        company,
        jobDescription,
        duration,
        transcript,
        emotions,
        audioBlob,
        totalDurationSeconds,
        humeSessionId,
        humeConfigId,
        selectedVoice
      } = sessionData;

      // Step 1: First check if session exists and get its details
      console.log('🔄 Looking for existing session:', sessionId);
      const existingSession = await prisma.eVIInterviewSession.findUnique({
        where: { id: sessionId }
      });

      console.log('🔍 Found existing session:', existingSession ? 'YES' : 'NO');
      if (existingSession) {
        console.log('🔍 Existing session details:', {
          id: existingSession.id,
          experienceId: existingSession.experienceId,
          interviewType: existingSession.interviewType,
          sessionEndTime: existingSession.sessionEndTime,
          humeSessionId: existingSession.humeSessionId
        });
      }

      if (!existingSession) {
        throw new Error(`Session ${sessionId} not found in database`);
      }

      // Step 2: Convert and upload audio to Supabase
      let audioFileUrl = null;
      if (audioBlob) {
        try {
          audioFileUrl = await this.uploadAudioToSupabase(audioBlob, sessionId);
          console.log('✅ Audio uploaded:', audioFileUrl);
        } catch (audioError) {
          console.error('❌ Audio upload failed:', audioError);
          // Continue without audio - not critical
        }
      }

      // Step 3: Extract insights based on interview type (use session's type as fallback)
      const interviewType = sessionData.interviewType || existingSession.interviewType || 'job_experience';
      console.log('📋 Interview type determined:', interviewType);
      let achievements;

      if (interviewType === 'work_style') {
        achievements = await this.extractWorkStyleInsights({
          transcript
        });
      } else {
        // For job_experience or other types, extract achievements
        achievements = await this.extractAchievements({
          jobTitle,
          company,
          duration,
          jobDescription,
          transcript
        });
      }

      // Step 4: Generate interview brief
      const interviewBrief = await this.generateInterviewBrief(transcript, interviewType);
      console.log('📄 Generated interview brief:', interviewBrief.wordCount, 'words');
      
      // Update the existing session with completion data
      const session = await prisma.eVIInterviewSession.update({
        where: { id: sessionId },
        data: {
          sessionEndTime: new Date(),
          totalDurationSeconds,
          questionsAsked: this.countQuestions(transcript),
          fullTranscript: transcript,
          achievements,
          interviewBrief,
          audioFileUrl: audioFileUrl || existingSession.audioFileUrl,
          // Don't update fields that should remain from creation
          // userId, experienceId, jobTitle, company, etc. stay the same
        }
      });

      // Step 5: Save individual messages with emotions
      if (emotions && emotions.length > 0) {
        await this.saveIndividualMessages(session.id, transcript, emotions);
      }

      console.log('✅ EVI interview processed successfully:', session.id);
      
      return {
        sessionId: session.id,
        achievements,
        transcript,
        audioFileUrl,
        duration: totalDurationSeconds,
        questionsAsked: this.countQuestions(transcript)
      };

    } catch (error) {
      console.error('❌ Error processing EVI interview:', error);
      throw error;
    }
  }

  /**
   * Extract achievements using OpenAI
   */
  async extractAchievements({ jobTitle, company, duration, jobDescription, transcript }) {
    try {
      console.log('🧠 Extracting achievements with OpenAI...');
      
      // Convert transcript array to string
      const transcriptText = Array.isArray(transcript) 
        ? transcript.map(msg => `${msg.type === 'assistant_message' ? 'AI:' : 'Candidate:'} ${msg.content}`).join('\n')
        : transcript;

      const prompt = `Job Title: ${jobTitle}
Company: ${company}
Duration: ${duration || 'Not specified'}

Transcript of the Interview:
${transcriptText}

Extract formal bullet points summarizing the candidate's achievements or contributions based ONLY on what they specifically said in the interview transcript above. 

CRITICAL RULES:
- Only extract achievements that were explicitly mentioned by the candidate in the transcript
- Do NOT use any information from the job description
- Do NOT infer or assume achievements that weren't directly stated
- If the candidate didn't provide enough specific information about achievements, return an empty array

Return a JSON object in this exact format:
{
  "achievements": [
    {"text": "Achievement description starting with action verb", "category": "technical"},
    {"text": "Another achievement description", "category": "leadership"}
  ],
  "summary": {
    "totalAchievements": 4,
    "dominantCategories": ["technical", "leadership"]
  }
}

Categories should be: "technical", "leadership", "process_improvement", "business_impact", or "collaboration"
Keep each bullet concise and specific.
If no clear achievements were mentioned in the interview, return {"achievements": [], "summary": {"totalAchievements": 0, "dominantCategories": []}}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional resume writer. Extract achievements as structured JSON with bullet points starting with action verbs. ONLY extract achievements that were explicitly stated by the candidate in the interview transcript. Do NOT use job description information. If no specific achievements were mentioned, return an empty achievements array. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content.trim();
      console.log('🤖 OpenAI raw response:', aiResponse);

      // Parse JSON response
      let achievements;
      try {
        achievements = JSON.parse(aiResponse);
        console.log('✅ Successfully parsed achievements:', JSON.stringify(achievements, null, 2));
        console.log('📊 Achievement count:', achievements.achievements ? achievements.achievements.length : 0);
      } catch (parseError) {
        console.error('⚠️ Failed to parse OpenAI JSON:', parseError);
        console.log('Raw response that failed to parse:', aiResponse);
        // Fallback: return empty achievements
        achievements = {
          achievements: [],
          summary: {
            totalAchievements: 0,
            dominantCategories: []
          }
        };
      }

      return achievements;

    } catch (error) {
      console.error('❌ Error extracting achievements:', error);
      // Return empty achievements on error
      return {
        achievements: [],
        summary: {
          totalAchievements: 0,
          dominantCategories: []
        }
      };
    }
  }

  /**
   * Generate interview brief using OpenAI
   * Creates a concise summary of the interview for future reference
   */
  async generateInterviewBrief(transcript, interviewType) {
    try {
      console.log('📝 Generating interview brief with OpenAI...');
      
      // Convert transcript array to string
      const transcriptText = Array.isArray(transcript) 
        ? transcript.map(msg => `${msg.type === 'assistant_message' ? 'AI:' : 'Candidate:'} ${msg.content}`).join('\n')
        : transcript;

      let prompt;
      if (interviewType === 'work_style') {
        prompt = `Based on this work style and career goals interview transcript, create a concise brief summarizing:
1. Work environment preferences
2. Collaboration and communication style
3. Career aspirations and goals
4. Key strengths and motivations

Only include information explicitly stated in the transcript. Do not make assumptions or infer details not mentioned.
Keep the brief under 200 words.

Transcript:
${transcriptText}`;
      } else {
        prompt = `Based on this job experience interview transcript, create a concise brief summarizing:
1. Key technical skills and expertise demonstrated
2. Most significant achievements and impacts
3. Leadership or collaboration examples
4. Problem-solving approaches used

Only include information explicitly stated in the transcript. Do not make assumptions or infer details not mentioned.
Keep the brief under 200 words.

Transcript:
${transcriptText}`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional interviewer creating concise briefs from interview transcripts. Only use information explicitly stated. Never make assumptions or add information not in the transcript."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 400
      });

      const brief = response.choices[0].message.content.trim();
      console.log('✅ Interview brief generated successfully');
      
      return {
        summary: brief,
        generatedAt: new Date().toISOString(),
        wordCount: brief.split(' ').length
      };

    } catch (error) {
      console.error('❌ Error generating interview brief:', error);
      // Return a fallback brief
      return {
        summary: "Interview transcript processed. Please refer to full transcript for details.",
        generatedAt: new Date().toISOString(),
        wordCount: 0,
        error: true
      };
    }
  }

  /**
   * Extract work style insights using OpenAI
   */
  async extractWorkStyleInsights({ transcript }) {
    try {
      console.log('🧠 Extracting work style insights with OpenAI...');
      
      // Check for minimum transcript length
      const messageCount = Array.isArray(transcript) ? transcript.length : 0;
      console.log('📊 Transcript message count:', messageCount);
      
      // If transcript is too short, return meaningful fallback
      if (messageCount < 4) {
        console.log('⚠️ Transcript too short for detailed analysis, using fallback insights');
        return {
          workStyle: {
            preferredEnvironment: "Unable to determine - interview was too brief",
            collaborationStyle: "Needs further discussion to assess collaboration preferences",
            communicationPreferences: "Limited interaction to evaluate communication style",
            workPace: "flexible",
            structurePreference: "hybrid"
          },
          careerGoals: {
            shortTerm: "To be discussed in a more detailed conversation",
            longTerm: "Requires deeper exploration of career aspirations",
            idealRole: "Needs further discussion",
            industries: ["Not specified"],
            companySize: "flexible"
          },
          strengths: [
            "Engaged in the interview process",
            "Open to discussing work preferences"
          ],
          motivations: [
            "Interested in exploring career opportunities",
            "Willing to share professional experiences"
          ],
          summary: {
            totalInsights: 2,
            interviewQuality: "brief",
            recommendation: "Schedule a follow-up interview for more comprehensive assessment"
          }
        };
      }
      
      // Convert transcript array to string
      const transcriptText = Array.isArray(transcript) 
        ? transcript.map(msg => `${msg.type === 'assistant_message' ? 'AI:' : 'Candidate:'} ${msg.content}`).join('\n')
        : transcript;

      const prompt = `Interview Transcript:
${transcriptText}

Extract the candidate's work style preferences and career goals based on this transcript.

IMPORTANT: If the transcript is very brief or lacks substantial content, provide reasonable defaults and indicate that more discussion is needed rather than making assumptions.

Return a JSON object in this exact format:
{
  "workStyle": {
    "preferredEnvironment": "Description of ideal work environment",
    "collaborationStyle": "How they work with others",
    "communicationPreferences": "How they prefer to communicate",
    "workPace": "fast-paced/steady/flexible",
    "structurePreference": "structured/flexible/hybrid"
  },
  "careerGoals": {
    "shortTerm": "1-2 year goals",
    "longTerm": "3-5 year aspirations",
    "idealRole": "Description of ideal next position",
    "industries": ["interested industries"],
    "companySize": "startup/mid-size/enterprise/flexible"
  },
  "strengths": [
    "Key personal strength 1",
    "Key personal strength 2"
  ],
  "motivations": [
    "What drives them professionally",
    "What they find fulfilling"
  ]
}

Extract insights directly from the transcript. Do not make assumptions beyond what was discussed.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional career counselor analyzing work style preferences and career aspirations. Extract structured insights about how the candidate likes to work and what they're looking for in their career. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const aiResponse = response.choices[0].message.content.trim();
      console.log('🤖 OpenAI work style response:', aiResponse);
      
      // Parse JSON response
      let insights;
      try {
        insights = JSON.parse(aiResponse);
        
        // Validate that we have the expected structure
        if (!insights.workStyle || !insights.careerGoals) {
          throw new Error('Invalid response structure from OpenAI');
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse OpenAI JSON, creating fallback structure:', parseError);
        // Fallback: create basic structure
        insights = {
          workStyle: {
            preferredEnvironment: "Professional environment with growth opportunities",
            collaborationStyle: "Team-oriented with independent work capability", 
            communicationPreferences: "Clear and direct communication",
            workPace: "flexible",
            structurePreference: "hybrid"
          },
          careerGoals: {
            shortTerm: "Continue developing professional skills",
            longTerm: "Advance in career with increasing responsibilities",
            idealRole: "Role that matches skills and interests",
            industries: ["technology"],
            companySize: "flexible"
          },
          strengths: ["Professional communication", "Adaptability"],
          motivations: ["Professional growth", "Making an impact"]
        };
      }

      return insights;

    } catch (error) {
      console.error('❌ Error extracting work style insights:', error);
      // Return fallback insights
      return {
        workStyle: {
          preferredEnvironment: "Unable to extract from interview",
          collaborationStyle: "Unable to extract from interview",
          communicationPreferences: "Unable to extract from interview",
          workPace: "unknown",
          structurePreference: "unknown"
        },
        careerGoals: {
          shortTerm: "Unable to extract from interview",
          longTerm: "Unable to extract from interview",
          idealRole: "Unable to extract from interview",
          industries: [],
          companySize: "unknown"
        },
        strengths: [],
        motivations: []
      };
    }
  }

  /**
   * Upload audio blob to Supabase storage as MP3
   */
  async uploadAudioToSupabase(audioBlob, sessionId) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping audio upload');
      return null;
    }
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🎵 Converting and uploading audio...');
        
        // Create temp file paths
        const tempDir = '/tmp';
        const inputPath = path.join(tempDir, `${sessionId}-input.webm`);
        const outputPath = path.join(tempDir, `${sessionId}-output.mp3`);
        
        // Write blob to temp file
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        fs.writeFileSync(inputPath, buffer);
        
        // Convert WebM to MP3 using ffmpeg
        ffmpeg(inputPath)
          .toFormat('mp3')
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .save(outputPath)
          .on('end', async () => {
            try {
              console.log('✅ Audio conversion completed');
              
              // Read converted MP3
              const mp3Buffer = fs.readFileSync(outputPath);
              
              // Upload to Supabase storage
              const fileName = `evi-interviews/${sessionId}.mp3`;
              const { data, error } = await supabase.storage
                .from('interview-audio')
                .upload(fileName, mp3Buffer, {
                  contentType: 'audio/mpeg',
                  upsert: true
                });
                
              if (error) {
                throw error;
              }
              
              // Get public URL
              const { data: publicUrlData } = supabase.storage
                .from('interview-audio')
                .getPublicUrl(fileName);
                
              // Cleanup temp files
              fs.unlinkSync(inputPath);
              fs.unlinkSync(outputPath);
              
              console.log('✅ Audio uploaded to Supabase:', publicUrlData.publicUrl);
              resolve(publicUrlData.publicUrl);
              
            } catch (uploadError) {
              console.error('❌ Error uploading to Supabase:', uploadError);
              
              // Cleanup temp files
              try {
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
              } catch (cleanupError) {
                console.warn('⚠️ Cleanup error:', cleanupError);
              }
              
              reject(uploadError);
            }
          })
          .on('error', (ffmpegError) => {
            console.error('❌ FFmpeg conversion error:', ffmpegError);
            
            // Cleanup temp files
            try {
              fs.unlinkSync(inputPath);
            } catch (cleanupError) {
              console.warn('⚠️ Cleanup error:', cleanupError);
            }
            
            reject(ffmpegError);
          });
          
      } catch (error) {
        console.error('❌ Error in audio upload process:', error);
        reject(error);
      }
    });
  }

  /**
   * Save individual messages with emotion data
   */
  async saveIndividualMessages(sessionId, transcript, emotions) {
    try {
      console.log('💾 Saving individual messages with emotions...');
      
      const messages = [];
      let messageOrder = 1;
      
      // Pair up AI questions with user responses
      for (let i = 0; i < transcript.length - 1; i += 2) {
        const aiMessage = transcript[i];
        const userMessage = transcript[i + 1];
        
        if (aiMessage && userMessage && 
            aiMessage.type === 'assistant_message' && 
            userMessage.type === 'user_message') {
          
          // Find corresponding emotion data for this user response
          const emotionData = emotions.find(e => 
            e.content === userMessage.content || 
            Math.abs(new Date(e.timestamp) - new Date(userMessage.timestamp)) < 5000 // 5 second tolerance
          );
          
          messages.push({
            sessionId,
            aiQuestion: aiMessage.content,
            candidateResponse: userMessage.content,
            messageOrder,
            candidateEmotionsRaw: emotionData || null,
            questionAskedAt: new Date(aiMessage.timestamp),
            responseGivenAt: new Date(userMessage.timestamp)
          });
          
          messageOrder++;
        }
      }
      
      if (messages.length > 0) {
        await prisma.eVIInterviewMessage.createMany({
          data: messages
        });
        console.log(`✅ Saved ${messages.length} message pairs`);
      }
      
    } catch (error) {
      console.error('❌ Error saving individual messages:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Count questions in transcript
   */
  countQuestions(transcript) {
    if (!Array.isArray(transcript)) return 0;
    return transcript.filter(msg => msg.type === 'assistant_message').length;
  }

  /**
   * Get interview session by ID
   */
  async getInterviewSession(sessionId) {
    try {
      const session = await prisma.eVIInterviewSession.findUnique({
        where: { id: sessionId },
        include: {
          messages: {
            orderBy: { messageOrder: 'asc' }
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });
      
      // Ensure fullTranscript is included and properly formatted
      if (session && session.fullTranscript) {
        // If fullTranscript is stored as JSON, ensure it's an array
        if (typeof session.fullTranscript === 'object' && !Array.isArray(session.fullTranscript)) {
          // If it's wrapped in an object, extract the messages array
          if (session.fullTranscript.messages) {
            session.fullTranscript = session.fullTranscript.messages;
          } else if (session.fullTranscript.transcript) {
            session.fullTranscript = session.fullTranscript.transcript;
          }
        }
      }
      
      return session;
    } catch (error) {
      console.error('❌ Error fetching interview session:', error);
      throw error;
    }
  }

  /**
   * Get user's interview history
   */
  async getUserInterviewHistory(userId, limit = 10) {
    try {
      const sessions = await prisma.eVIInterviewSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          jobTitle: true,
          company: true,
          duration: true,
          sessionStartTime: true,
          sessionEndTime: true,
          totalDurationSeconds: true,
          questionsAsked: true,
          achievements: true,
          createdAt: true
        }
      });
      
      return sessions;
    } catch (error) {
      console.error('❌ Error fetching user interview history:', error);
      throw error;
    }
  }
}

const eviInterviewService = new EVIInterviewService();
eviInterviewService.WORK_STYLE_EXPERIENCE_ID = WORK_STYLE_EXPERIENCE_ID;

module.exports = eviInterviewService;