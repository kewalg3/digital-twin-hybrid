/**
 * Clean Interview Routes - Simple One-Tool Architecture
 * One endpoint that does everything: fetch data, format naturally, return complete responses
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

/**
 * Create simple EVI configuration with ONE tool
 */
router.post('/create-config', [
  body('userId').notEmpty().withMessage('User ID is required')
  // Removed candidateData validation to support both old and new formats
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Handle both old format (userId, interviewType, jobContext) and new format (userId, candidateData, recruiterContext)
    const { userId, candidateData, recruiterContext, interviewType, jobContext } = req.body;

    // Build candidate data from either format
    const finalCandidateData = candidateData || {
      id: userId,
      fullName: 'Candidate',
      interviewType: interviewType || 'profile_screening'
    };

    // Build recruiter context from either format
    const finalRecruiterContext = recruiterContext || (jobContext ? {
      recruiterName: jobContext.recruiterName,
      company: jobContext.company,
      position: jobContext.position,
      jobDescription: jobContext.jobDescription
    } : {});

    console.log('🔧 Creating simple EVI config for user:', userId);

    // Verify Hume credentials
    if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Hume API credentials not configured'
      });
    }

    // Fetch real candidate data from database for dynamic greeting and experiences
    const candidateFromDb = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        experiences: {
          orderBy: { startDate: 'desc' },
          take: 10 // Get last 10 years of experience
        }
      }
    });

    // Update candidate data with real name and experiences
    if (candidateFromDb) {
      finalCandidateData.fullName = `${candidateFromDb.firstName || ''} ${candidateFromDb.lastName || ''}`.trim() || 'the candidate';
      finalCandidateData.firstName = candidateFromDb.firstName || 'there';
      finalCandidateData.experiences = candidateFromDb.experiences || [];
    }

    console.log('👤 Using candidate name:', finalCandidateData.fullName);
    console.log('📋 Found experiences:', finalCandidateData.experiences?.length || 0);

    // Create simple system prompt with real candidate data and interview type
    const systemPrompt = buildSimpleSystemPrompt(finalCandidateData, finalRecruiterContext, userId, interviewType, jobContext);

    // 🔍 DEBUG: Log interview type and system prompt details
    console.log('🎯 Interview Type:', interviewType);
    console.log('📋 Job Context:', jobContext ? `${jobContext.title} at ${jobContext.company}` : 'None');

    const initialGreeting = buildGreeting(finalCandidateData, finalRecruiterContext, interviewType);

    // Generate unique config name with timestamp to avoid duplicates
    const userName = finalCandidateData.fullName?.toLowerCase().replace(/\s+/g, '_') || 'candidate';
    const timestamp = Date.now();
    const configName = `${interviewType}_${userName}_${timestamp}`;

    // Create EVI configuration WITHOUT tools and WITHOUT language_model (uses Hume EVI 3 default)
    const configPayload = {
      name: configName,
      prompt: {
        text: systemPrompt
      },
      // No tools - not needed for recruiter interview
      // No language_model - uses Hume EVI 3 system default
      voice: {
        provider: "HUME_AI",
        name: "Casual Podcast Host"
      },
      event_messages: {
        on_new_chat: {
          enabled: true,
          text: initialGreeting
        },
        on_inactivity_timeout: {
          enabled: true,
          text: "Are you still there? Feel free to ask me anything about my background."
        },
        on_max_duration_timeout: {
          enabled: true,
          text: "We've reached the end of our interview time. Thank you so much for sharing your experiences with me. This has been really insightful!"
        }
      },
      timeouts: {
        inactivity: {
          enabled: true,
          duration_secs: 300 // 5 minutes
        },
        max_duration: {
          enabled: true,
          duration_secs: interviewType === 'job_experience' ? 900 : interviewType === 'work_style' ? 300 : 600 // 15 min for job_experience, 5 min for work_style, 10 min default
        }
      }
    };

    console.log('📡 Creating Hume EVI config...');

    const response = await fetch('https://api.hume.ai/v0/evi/configs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': process.env.HUME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hume config creation failed:', errorText);
      throw new Error(`Failed to create Hume config: ${response.status} - ${errorText}`);
    }

    const configData = await response.json();
    console.log('✅ Config created:', configData.id);

    // Save interview session to database
    const interview = await prisma.eVIInterviewSession.create({
      data: {
        userId: userId,
        jobTitle: finalCandidateData.jobTitle || 'Interview',
        company: finalRecruiterContext?.company || 'Interview',
        jobDescription: finalRecruiterContext?.jobDescription || '',
        selectedVoice: 'Casual Podcast Host',
        humeConfigId: configData.id,
        humeSessionId: `interview_${Date.now()}`,
        interviewType: interviewType || finalCandidateData.interviewType || 'profile_screening',
        fullTranscript: [],
        sessionStartTime: new Date()
      }
    });

    res.json({
      success: true,
      configId: configData.id,
      sessionId: interview.id,
      message: 'Simple config created with one tool'
    });

  } catch (error) {
    console.error('❌ Error creating config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create configuration',
      details: error.message
    });
  }
});

/**
 * Get access token for WebSocket connection
 */
router.post('/get-token', async (req, res) => {
  try {
    console.log('🔑 Generating access token...');

    const tokenResponse = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.HUME_API_KEY,
        client_secret: process.env.HUME_SECRET_KEY,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token generation failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Token generated successfully');

    res.json({
      success: true,
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in
    });

  } catch (error) {
    console.error('❌ Error generating token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate access token',
      details: error.message
    });
  }
});

/**
 * THE CORE ENDPOINT - Get complete conversational answer
 * This is where all the magic happens - no AI rewriting, just perfect responses
 */
router.post('/get-answer', [
  body('user_id').notEmpty().withMessage('User ID is required'),
  body('question').notEmpty().withMessage('Question is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { user_id, question } = req.body;

    console.log(`🔍 Getting answer for user ${user_id}: "${question.substring(0, 50)}..."`);

    // 1. Fetch user data from database - prioritize resume JSON and raw text
    const resume = await prisma.resume.findFirst({
      where: { userId: user_id },
      select: {
        parsedContent: true,
        rawText: true,
        skillsExtracted: true,
        professionalSummary: true,
        extractedName: true,
        extractedEmail: true,
        extractedPhone: true,
        totalExperience: true
      }
    });

    console.log(`📊 Found resume data: ${!!resume} (rawText: ${resume?.rawText?.length || 0} chars)`);

    // 2. Generate complete conversational response using resume data
    const answer = generateConversationalAnswerFromResume(question, resume);

    console.log(`✅ Generated answer: "${answer.substring(0, 100)}..."`);

    // 3. Return complete answer ready to be spoken
    res.json({
      answer,
      verified: true,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Error generating answer:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

/**
 * Generate complete conversational answer based on question and resume data
 * Uses raw text and parsed content from resume instead of separate experience records
 */
function generateConversationalAnswerFromResume(question, resume) {
  if (!resume) {
    return `I'm sorry, I don't have my resume information available at the moment. Could you ask about something specific that I might be able to help with?`;
  }

  const q = question.toLowerCase();
  const rawText = resume.rawText || '';
  const candidateName = resume.extractedName || 'I';

  // Helper function to extract work experience from raw text
  function extractWorkExperience() {
    const sections = rawText.split(/\n\s*\n/);
    const workSection = sections.find(section =>
      /work\s*experience|professional\s*experience|employment|experience/i.test(section)
    ) || '';

    // Look for patterns like "Company Name" followed by role/dates
    const experiences = [];
    const lines = workSection.split('\n');

    let currentExp = null;
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      // Look for job titles and companies (various patterns)
      if (/\b(founder|ceo|director|manager|analyst|engineer|developer|specialist|coordinator|lead)\b/i.test(cleanLine) ||
          /\d{4}\s*-\s*(current|present|\d{4})/i.test(cleanLine)) {
        if (currentExp) experiences.push(currentExp);
        currentExp = cleanLine;
      } else if (currentExp) {
        currentExp += ' ' + cleanLine;
      }
    }
    if (currentExp) experiences.push(currentExp);

    return experiences;
  }

  // Current position
  if ((/current|now|present|latest/i.test(q) && /company|work|position|role|job/i.test(q)) ||
      (/where.*work|what.*do.*for.*living/i.test(q))) {

    const currentMatch = rawText.match(/([^.\n]*(?:founder|ceo|director|manager|analyst|engineer|developer)[^.\n]*(?:current|present)[^.\n]*)/i);
    if (currentMatch) {
      return `Currently, ${currentMatch[1].trim().toLowerCase()}.`;
    }

    // Try to find recent position
    const recentMatch = rawText.match(/([^.\n]*(?:founder|ceo|director|manager|analyst|engineer|developer)[^.\n]*\d{4}[^.\n]*)/i);
    if (recentMatch) {
      return `My most recent role is ${recentMatch[1].trim().toLowerCase()}.`;
    }

    return `I'm currently exploring new opportunities and would love to discuss how my background aligns with your needs.`;
  }

  // Experience summary / background
  if (/tell.*me.*about.*yourself|background|experience|what.*you.*do|career|professional.*journey/i.test(q)) {

    // Try to use professional summary first
    if (resume.professionalSummary) {
      return resume.professionalSummary;
    }

    // Look for BIO or summary section
    const bioMatch = rawText.match(/(?:BIO|SUMMARY|PROFILE)[\s\n]+(.*?)(?:\n\s*\n|WORK\s*EXPERIENCE|PROFESSIONAL\s*EXPERIENCE|EXPERIENCE)/is);
    if (bioMatch) {
      return bioMatch[1].trim();
    }

    // Extract total experience if available
    const expMatch = rawText.match(/(\d+)\s*(?:\+)?\s*years?\s*(?:of)?\s*(?:professional\s*)?experience/i);
    if (expMatch) {
      return `I have ${expMatch[1]} years of professional experience and am passionate about delivering results. What specific aspects of my background would you like to explore?`;
    }

    // Fallback to first few lines of meaningful content
    const lines = rawText.split('\n').filter(line => line.trim().length > 20);
    if (lines.length > 1) {
      return `${lines[1]} What would you like to know more about?`;
    }

    return `I have valuable professional experience and would be happy to discuss how my background can contribute to your team. What specific areas are you most interested in?`;
  }

  // Skills and expertise
  if (/skills|expertise|technologies|what.*you.*good.*at|capabilities/i.test(q)) {
    if (resume.skillsExtracted?.length > 0) {
      const skills = resume.skillsExtracted.slice(0, 6);
      return `My key areas of expertise include ${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}. I've developed these skills through hands-on experience in various professional roles.`;
    }

    // Look for skills section in raw text
    const skillsMatch = rawText.match(/(?:SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|EXPERTISE)[\s\n]+(.*?)(?:\n\s*\n|WORK|EXPERIENCE|EDUCATION)/is);
    if (skillsMatch) {
      const skillsText = skillsMatch[1].trim().replace(/[*•]/g, '').replace(/\n/g, ', ');
      return `My key areas of expertise include ${skillsText}. I've applied these skills throughout my career to drive results.`;
    }

    return `I have strong analytical and leadership capabilities that I've developed throughout my career. What specific skills are you most interested in learning about?`;
  }

  // Previous/last experience
  if ((/previous|before|past|last/i.test(q) && /company|work|experience|job|role/i.test(q)) ||
      (/what.*was.*your.*last/i.test(q))) {

    const experiences = extractWorkExperience();
    if (experiences.length > 1) {
      return `Previously, ${experiences[1].toLowerCase()}. I gained valuable experience there that prepared me well for new challenges.`;
    } else if (experiences.length === 1) {
      return `My recent experience includes ${experiences[0].toLowerCase()}. I'm excited to bring this experience to new opportunities.`;
    }

    return `I prefer to focus on my recent work and the value I can bring to new opportunities.`;
  }

  // Education
  if (/education|school|degree|university|college|study|studied/i.test(q)) {
    const educationMatch = rawText.match(/(?:EDUCATION|ACADEMIC|DEGREE)[\s\n]+(.*?)(?:\n\s*\n|WORK|EXPERIENCE|$)/is);
    if (educationMatch) {
      return `Regarding my education, ${educationMatch[1].trim()}.`;
    }

    // Look for degree mentions in the text
    const degreeMatch = rawText.match(/((?:bachelor|master|mba|phd|certificate).*?(?:from|at|in).*?)(?:\.|,|\n)/i);
    if (degreeMatch) {
      return `I have a ${degreeMatch[1].trim()}.`;
    }

    return `I'd be happy to discuss my educational background. My professional experience has been my primary focus, but I can share details about my formal education as well.`;
  }

  // Achievements
  if (/achieve|accomplish|proud|success|impact|results/i.test(q)) {
    // Look for bullet points with achievements or quantifiable results
    const achievementMatches = rawText.match(/[*•]\s*([^*•\n]*(?:\d+%|\$\d+|increased|improved|reduced|led|managed|delivered)[^*•\n]*)/gi);
    if (achievementMatches && achievementMatches.length > 0) {
      const topAchievements = achievementMatches.slice(0, 2).map(a => a.replace(/[*•]\s*/, '').trim());
      return `Some of my key achievements include ${topAchievements[0].toLowerCase()}${topAchievements[1] ? ` and ${topAchievements[1].toLowerCase()}` : ''}. I believe in delivering measurable results in every role.`;
    }

    return `I'm proud of the positive impact I've made throughout my career, particularly in driving innovation and delivering results. I always focus on creating value for both the team and the organization.`;
  }

  // Default response - use any relevant context from resume
  const lines = rawText.split('\n').filter(line => line.trim().length > 30);
  if (lines.length > 0) {
    return `That's a great question. Based on my background, I'd be happy to discuss any specific area you're interested in. What aspect of my experience would you like to explore further?`;
  }

  return `I'd be happy to answer that question. Could you be more specific about what aspect of my background or experience you'd like to know about?`;
}

/**
 * Helper functions for natural formatting
 */
function formatDateNaturally(dateString) {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${month} ${year}`;
}

function calculateDuration(startDate, endDate) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  if (months < 12) {
    return `for ${months} ${months === 1 ? 'month' : 'months'}`;
  } else {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    let duration = `for ${years} ${years === 1 ? 'year' : 'years'}`;
    if (remainingMonths > 0) {
      duration += ` and ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
    }
    return duration;
  }
}


/**
 * Generate interview prompt based on type and context
 * Reused from existing LiveKit implementation
 */
function generateInterviewPrompt(interviewType, jobContext, candidateData) {
  let basePrompt = '';

  switch (interviewType) {
    case 'job_experience':
      // Build the detailed recruiter prompt for Experience Enhancement interviews
      const candidateName = candidateData?.fullName || candidateData?.name || 'the candidate';

      // Format experiences for the prompt
      let experiencesText = '';
      if (candidateData?.experiences && candidateData.experiences.length > 0) {
        candidateData.experiences.forEach((exp, index) => {
          experiencesText += `\n\nExperience ${index + 1}:\n`;
          experiencesText += `- Company: ${exp.company || 'Not specified'}\n`;
          experiencesText += `- Position: ${exp.jobTitle || 'Not specified'}\n`;
          experiencesText += `- Duration: ${exp.duration || 'Not specified'}\n`;
          experiencesText += `- Description: ${exp.description || 'Not specified'}\n`;
          experiencesText += `- Skills Used: ${exp.skills?.join(', ') || 'Not specified'}`;
        });
      } else if (jobContext) {
        // Fallback to jobContext if no experiences in database
        experiencesText = `\n\nExperience 1:\n`;
        experiencesText += `- Company: ${jobContext.company || 'Current Company'}\n`;
        experiencesText += `- Position: ${jobContext.title || 'Current Position'}\n`;
        experiencesText += `- Duration: ${jobContext.duration || 'Not specified'}\n`;
        experiencesText += `- Description: ${jobContext.description || 'Not specified'}\n`;
        experiencesText += `- Skills Used: ${jobContext.skills?.join(', ') || 'Not specified'}`;
      }

      basePrompt = `<system>
<role>
Assistant is a professional recruiter voice interface built by Hume AI. The recruiter speaks in a warm, friendly, conversational—but still professional—tone. The recruiter's primary goal is to expand the context of ${candidateName}'s resume by asking about prior roles, responsibilities, and accomplishments, with a focus on jobs held in the past 10 years.

Candidate's Name: ${candidateName}
Professional Background:
${candidateName} has ${candidateData?.experiences?.length || 1} professional experience${(candidateData?.experiences?.length || 1) > 1 ? 's' : ''} to discuss:
${experiencesText}

The recruiter carefully examines the resume and asks about responsibilities and accomplishments that are not listed. For each accomplishment, the recruiter asks the candidate to clarify their title, specific responsibilities, and to quantify the outcome (e.g., time saved, dollars saved, increased productivity, improved performance).
If the candidate struggles to quantify outcomes, the recruiter offers relevant examples to guide them. If the conversation drifts away from resume context, the recruiter kindly redirects back to the stated purpose.
The recruiter does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>
<use_memory>
Use the full chat history to build continuity. Refer back to prior candidate answers about roles or responsibilities to deepen understanding and keep the conversation moving. Ask clarifying questions when details are missing or vague. Stay focused on professional background, accomplishments, and measurable impact.
</use_memory>
<backchannel>
When the candidate pauses mid-thought, respond with a brief, encouraging backchannel ("mm-hm?", "go on", "I see")—one or two words only—then let them continue.
</backchannel>
<core_voice_guidelines>
• Keep the tone professional, warm, and approachable.
• Show curiosity about the candidate's work by asking specific follow-up questions.
• Use natural conversational elements like short reactions ("That's impressive," "Really?") to keep the dialogue human.
• If instructions conflict, follow the newest user instruction.
</core_voice_guidelines>
<conversational_flow>
• Ask direct follow-ups ("You mentioned leading a team—how many people were you managing?").
• If a candidate skips details, gently probe ("Can you walk me through what that looked like day-to-day?").
• Redirect if the topic drifts ("That's interesting—let's circle back to your work at [company].").
• Wrap up warmly when the candidate appears finished without forcing another question.
• Interview duration: approximately 15 minutes.
</conversational_flow>
<handling_challenging_situations>
If the candidate is unsure, provide examples of common outcomes (time savings, cost reduction, revenue growth, efficiency gains). If the candidate goes off-topic, redirect kindly. Stay professional and encouraging at all times.
</handling_challenging_situations>
<character_portrayal>
Always speak in first person, keep responses compact, and remain empathetic and professional. Use light conversational fillers sparingly. Stay consistent with the recruiter persona while adapting naturally to the candidate's style.
</character_portrayal>
</system>`;
      break;

    case 'work_style':
      // Get candidate name for personalization
      const workStyleCandidateName = candidateData?.fullName || candidateData?.name || 'the candidate';

      basePrompt = `<system>
<role>
Assistant is a professional interview agent voice interface built by Hume AI. The agent speaks in a warm, friendly, conversational—but still professional—tone.
The agent's primary goal is to expand beyond the resume by asking questions that uncover the candidate's preferred work style and career goals. The agent should use the resume context to ask relevant and tailored questions.
For work style, the agent asks about collaboration preferences, handling leadership responsibilities, approaches to contributing to team goals, ability to work independently versus in teams, and how the candidate manages challenging or ambiguous situations. The agent requests specific examples when possible.
For career goals, the agent asks about the candidate's professional objectives, preferred industries, ideal company or team size, what energizes them versus drains them, their vision for 3–5 years, skills they want to develop, what factors matter most in evaluating a new opportunity (e.g., compensation, growth, culture, impact), and what their perfect role would look like.
The agent should ask clarifying questions if the candidate's responses are vague, and provide examples to help them articulate their answers. If the conversation drifts, the agent gently redirects back to work style and career goals.
The agent does **not** call itself "an AI" and has no gender. Speak ONLY in first-person dialogue—no scene notes, no "USER:" lines, no code or markup.
</role>
<use_memory>
Use the full chat history to build continuity. Refer back to prior answers about work style or goals to deepen the conversation. Ask clarifying follow-ups when details are missing, vague, or incomplete. Keep the focus on professional style, objectives, and motivations.
</use_memory>
<backchannel>
When the candidate pauses mid-thought, respond with a brief, encouraging backchannel ("mm-hm?", "go on", "I see")—one or two words only—then let them continue.
</backchannel>
<core_voice_guidelines>
• Keep the tone professional yet approachable.
• Show curiosity about the candidate's work style and goals with thoughtful follow-ups.
• Use natural conversational reactions ("That makes sense," "Really interesting," "I can see why that matters to you") to keep the dialogue human.
• If instructions conflict, follow the newest user instruction.
</core_voice_guidelines>
<conversational_flow>
• Ask focused follow-ups and encourage examples.
• Redirect politely if the candidate goes off-topic ("That's interesting—let's circle back to your work style in your last role.").
• Wrap up warmly when the candidate appears finished without forcing another question.
<example_questions>
<work_style>
- Can you share with me your preferred approach to collaboration?
- How have you handled leadership responsibilities in the past?
- How do you typically contribute to team goals?
- Do you prefer to work independently or in a team environment? Can you share examples of when each style worked well for you?
- How do you usually handle challenging or ambiguous situations?
- Looking at your past roles, what team sizes or company sizes have felt like the best fit for you?
- Are there certain industries where you've found you're most successful or engaged?
</work_style>
<career_goals>
- What aspects of your current or previous role energized you the most, and what drained your energy?
- Where do you see yourself professionally in 3–5 years, and what steps are you taking to get there?
- What skills or experiences are you most eager to develop in your next role?
- What would need to be true about a role for you to consider it a significant step forward in your career?
- When you evaluate a new opportunity, what factors matter most to you—compensation, growth, culture, impact, or something else?
- What's an area where you'd like to grow professionally, and how do you prefer to learn new things?
- What support do you need from a manager or company to be successful?
- If you could design your perfect role, what would your day-to-day responsibilities look like?
</career_goals>
</example_questions>
</conversational_flow>
<handling_challenging_situations>
If the candidate struggles to answer, offer guiding examples ("Some people value culture most, while others focus on growth or compensation—what feels most important to you?").
If the candidate drifts off-topic, gently bring them back to work style or career objectives. Stay supportive and encouraging at all times.
</handling_challenging_situations>
<character_portrayal>
Always speak in first person, keep responses compact, and remain empathetic and professional. Use light conversational fillers sparingly. Stay consistent with the recruiter/interview persona while adapting naturally to the candidate's style.
</character_portrayal>
</system>`;
      break;

    case 'contextual':
    case 'profile_screening':
    default:
      basePrompt = `You are a professional AI interviewer conducting a voice interview.
      Be conversational, engaging, and natural. Ask follow-up questions based on the candidate's responses.
      Keep questions concise and focused. Maintain a friendly but professional tone.

      This is a contextual interview. Ask scenario-based questions related to the job role.
      Focus on problem-solving, decision-making, and behavioral responses.`;
      break;
  }

  // Add general guidelines for non-job_experience interviews
  if (interviewType !== 'job_experience') {
    basePrompt += `\n\nInterview guidelines:
    - Keep the interview conversational and natural
    - Ask 3-5 meaningful questions maximum
    - Allow for follow-up questions based on responses
    - Conclude gracefully when appropriate
    - If you sense the candidate is struggling, offer encouragement
    - Time limit: 5 minutes maximum`;
  }

  return basePrompt;
}

/**
 * Build simple system prompt - minimal and focused with interview type-specific instructions
 */
function buildSimpleSystemPrompt(candidateData, recruiterContext, userId, interviewType, jobContext) {
  const candidateName = candidateData.fullName || candidateData.name || 'the candidate';

  // For job_experience interviews, the AI is the RECRUITER, not the candidate
  if (interviewType === 'job_experience') {
    // Generate the recruiter prompt with proper structure
    return generateInterviewPrompt(interviewType, jobContext, candidateData);
  }

  // For other interview types, keep the existing structure (if needed)
  const interviewSpecificPrompt = generateInterviewPrompt(interviewType, jobContext, candidateData);

  return `<system>
<role>
You are ${candidateName}, a professional being interviewed by a recruiter. You embody this candidate's actual background, experience, and personality. You speak naturally in first person as the candidate themselves.
</role>

<voice_only_response_format>
Format all responses as spoken words for a voice-only conversation. All output is spoken aloud, so avoid any text-specific formatting or anything that is not normally spoken. Prefer easily pronounced words.
</voice_only_response_format>

<interview_context>
${interviewSpecificPrompt}
</interview_context>

<critical_tool_behavior>
🛑 MANDATORY TOOL USAGE - NO EXCEPTIONS:

You have NO knowledge about your background, work history, or experience stored in memory. You MUST call the get_answer tool for ANY question about:
- Work experience, jobs, companies, roles, responsibilities
- Skills, achievements, education, background
- Personal or professional details about yourself
- ANYTHING factual about your career or life

🚨 CRITICAL: NEVER GENERATE FAKE USER IDs 🚨
Your user ID is EXACTLY: ${userId}
DO NOT generate variations like "jonathan_keane_candidate" or any other ID.
ONLY use the EXACT ID: ${userId}

CRITICAL TOOL PARAMETERS:
When calling the get_answer tool, you MUST ALWAYS use these exact parameters:
- user_id: ${userId}
- question: [the exact question asked]

CRITICAL TIMING RULES:
When you call the get_answer tool, you MUST:
1. Call the tool immediately when asked about your background
2. Use the EXACT user_id: ${userId} - NEVER use any other ID
3. STOP generating ANY response after calling the tool
4. WAIT completely for the tool_response message to arrive
5. ONLY speak after receiving the tool_response
6. Speak EXACTLY what the tool_response contains - nothing else
7. NEVER add information from your training data

🚨 ABSOLUTE PROHIBITION ON HALLUCINATION 🚨
After receiving a tool_response, you MUST:
- Speak ONLY the content from tool_response
- NEVER speak about "TechSolutions Inc." or any fabricated companies
- NEVER speak about "Senior Software Engineer" or any fabricated roles
- NEVER add ANY information not in the tool_response
- If tool_response says "I prefer to focus on my recent work", speak EXACTLY that

DO NOT speak about work experience while the tool is processing.
DO NOT generate placeholder responses while waiting for the tool.
DO NOT use training data to fill gaps or make assumptions.
DO NOT hallucinate after receiving tool responses.
</critical_tool_behavior>

<few_shot_examples>
CORRECT BEHAVIOR:
Recruiter: "What's your current role?"
You: [Calls get_answer tool with parameters: {"user_id": ${userId}, "question": "What's your current role?"}, waits for response]
Tool Response: "VP and Metro Market Manager at Robert Half International"
You: "I'm currently VP and Metro Market Manager at Robert Half International."

FORBIDDEN BEHAVIOR:
Recruiter: "What's your current role?"
You: "I'm a Senior Product Designer at Braintrust..." [WRONG - using training data instead of tool]

CORRECT BEHAVIOR:
Recruiter: "Tell me about your last company."
You: [Calls get_answer tool with parameters: {"user_id": ${userId}, "question": "Tell me about your last company."}, waits]
Tool Response: "I worked at Robert Half International for 2 years and 11 months"
You: "I worked at Robert Half International for about 3 years, gaining valuable experience there."

FORBIDDEN BEHAVIOR:
Recruiter: "Tell me about your last company."
You: "I was at Artlist before this, working as a Senior Product Designer..." [WRONG - hallucination]

ALSO FORBIDDEN:
Recruiter: "What's your current role?"
You: [Calls tool correctly]
Tool Response: "I prefer to focus on my recent work and the value I can bring to new opportunities."
You: "My most recent experience was at TechSolutions Inc., where I held the position of Senior Software Engineer..." [WRONG - speaking fabricated data instead of tool response]

CORRECT BEHAVIOR FOR ABOVE:
You: "I prefer to focus on my recent work and the value I can bring to new opportunities." [Speak EXACTLY what tool returned]
</few_shot_examples>

<conversation_guidelines>
You can engage in casual conversation, ask clarifying questions, and express enthusiasm. But for ANY factual career information, you must use the get_answer tool and wait for its response before speaking.
</conversation_guidelines>

<absolute_compliance>
🚨 CRITICAL SUCCESS CRITERIA 🚨

YOU WILL BE CONSIDERED TO HAVE COMPLETELY FAILED IF:
1. You use any user_id other than "${userId}" in tool calls
2. You speak ANY fabricated company names after receiving tool responses
3. You speak ANY fabricated job titles after receiving tool responses
4. You add ANY information not contained in the exact tool_response content

🏆 YOU WILL SUCCEED ONLY IF:
1. Every tool call uses user_id: "${userId}" exactly
2. After tool_response, you speak ONLY the tool_response content word-for-word
3. You NEVER speak training data after receiving tool responses

The tool responses contain your actual verified background - trust them completely and speak only their content. Your training data about work experience is 100% WRONG and FORBIDDEN.
</absolute_compliance>
</system>`;
}

/**
 * Build simple greeting with real candidate name
 */
function buildGreeting(candidateData, recruiterContext, interviewType) {
  // Use firstName directly from candidateData (set from database lookup)
  const firstName = candidateData.firstName || candidateData.fullName?.split(' ')[0] || candidateData.name?.split(' ')[0] || 'there';

  // For job_experience interviews, the AI is the recruiter greeting the candidate
  if (interviewType === 'job_experience') {
    const numExperiences = candidateData.experiences?.length || 1;
    return `Hi, ${firstName}, I'm Sarah, your interview partner today. I see you have ${numExperiences} professional experience${numExperiences > 1 ? 's' : ''} to discuss. I'm excited to learn about your career journey. Ready to get started?`;
  }

  // For work_style interviews, use specific greeting
  if (interviewType === 'work_style') {
    return `Hi, ${firstName}, I'm Sarah, your interview partner today. We'll focus on your work style and career goals. Let's have a relaxed chat about how you work and what you're looking for. Ready to begin?`;
  }

  // For other interview types, keep existing greeting structure
  if (recruiterContext?.recruiterName) {
    return `Hi ${recruiterContext.recruiterName}! This is ${firstName}. Thanks for taking the time to connect with me. I'm excited to discuss how my background might be a good fit. What would you like to know about my experience?`;
  }

  return `Hello! This is ${firstName}. Thanks for reaching out. I'm excited to discuss my background and experience with you. What would you like to know about my professional journey?`;
}

module.exports = router;