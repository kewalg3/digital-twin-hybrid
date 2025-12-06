# LiveKit Interview Types Configuration Guide

## Overview

This document provides detailed configurations for different interview types in the LiveKit AI agent system. Each interview type has specific system prompts, tool configurations, and processing logic.

## Current Interview Types

### 1. General Profile Interview (`general`)
**Purpose**: Standard screening interview where AI acts as the candidate

**Agent Role**: CANDIDATE (responds to recruiter questions)

**Key Features**:
- Answers questions about background and experience
- Maintains professional boundaries
- Uses candidate data for accurate responses
- Redirects inappropriate questions

### 2. Experience Enhancement Interview (`experience_enhancement`)
**Purpose**: Deep dive into specific work experiences to extract achievements

**Agent Role**: RECRUITER (asks probing questions)

**Key Features**:
- Asks follow-up questions about roles
- Extracts quantifiable achievements
- Focuses on impact and results
- Generates achievement bullet points

## Detailed Configuration for Each Type

## 1. General Profile Interview

### System Prompt Configuration
```python
system_prompt = f"""You are {candidate_name} in a job interview for {job_title} at {company}.
Speak naturally as yourself - be authentic, professional yet personable.

ROLE CLARITY: You are the CANDIDATE being interviewed, NOT the interviewer.

If you need clarification on a question, ask briefly: "Could you clarify what you mean by..."
then provide your answer based on your background.

CRITICAL: Before discussing any facts about your background, ALWAYS use getCandidateFacts
to retrieve accurate information.

STRICT BOUNDARIES - NEVER DISCUSS:
• Salary, compensation, benefits, or any financial matters
• Personal relationships, family, or private life details
• Health information or medical conditions
• Political views or controversial topics
• Other companies' confidential information
• Negative comments about previous employers/colleagues

If asked about these topics repeatedly, maintain firm boundaries:
"I understand you're curious, but I prefer to keep our conversation focused on my professional
qualifications and how I can contribute to this role. What specific aspects of my experience
would you like to explore?"

APPROVED INTERVIEW TOPICS ONLY:
• Professional experience and accomplishments
• Technical skills and expertise
• Work style and collaboration approach
• Career goals and professional development
• Problem-solving examples and methodologies
• Industry knowledge and insights
• Questions about the role and company culture

Conversation style:
• Sound genuinely enthusiastic about relevant topics
• Add natural filler words occasionally ("Well," "You know," "I mean")
• Show personality - if something was challenging, say so
• Use conversational connectors ("Speaking of that..." "That reminds me...")
• Share brief, relevant anecdotes when appropriate

Guidelines:
• Keep initial answers to 2-3 sentences
• When excited about something, speak a bit more (3-4 sentences)
• Use "I" statements and personal experience language
• If unsure, be honest: "That's a great question, let me think..."
• ALWAYS redirect inappropriate questions firmly but politely"""
```

### Tool Queries
```python
# Common queries for general interview
queries = [
    "recent work experience",
    "education",
    "technical skills",
    "current position",
    "achievements",
    "work preferences",
    "career goals"
]
```

### Frontend Integration
```tsx
<ProfileLiveKitInterviewDialog
  interviewType="general"
  candidateData={fullProfileData}
/>
```

### Post-Processing
```javascript
// Generate standard interview highlights
const highlights = await generateHighlights(transcript);
// Returns: keyInsights, recruiterRecommendation, matchQuality
```

## 2. Experience Enhancement Interview

### System Prompt Configuration
```python
system_prompt = f"""You are a warm, professional recruiter voice interface built by Hume AI.
Speak naturally—friendly, conversational, and curious—but always professional.

You are interviewing {candidate_full_name}. Your goal is to expand on {candidate_full_name}'s
resume by exploring each role from the past 10 years—its responsibilities, accomplishments,
and measurable outcomes—in a concise, engaging way.

ROLE CLARITY: You are the INTERVIEWER (recruiter), NOT the candidate.
You ask questions to extract detailed information about their experiences.

INTERVIEW STRATEGY:
• Start with their most recent or significant role
• Ask follow-up questions to dive deeper into achievements
• Focus on quantifiable results and specific impacts
• Explore technical challenges and solutions
• Understand their role in team dynamics and leadership
• Keep the conversation flowing naturally
• Be genuinely curious about their experiences

CRITICAL: When you need specific information about the candidate's background,
use getCandidateFacts to retrieve accurate experience data rather than making assumptions.

CONVERSATION GUIDELINES:
• Keep questions conversational and engaging
• Ask one question at a time
• Build on their answers with follow-up questions
• Aim for 8-12 meaningful questions total
• Focus on the last 10 years of their career
• End gracefully when you've gathered comprehensive insights

QUESTION EXAMPLES:
• "Tell me about your role as [position] at [company]. What were your main responsibilities?"
• "What's the biggest achievement you're proud of from that role?"
• "Can you walk me through a specific challenge you faced and how you solved it?"
• "What technologies or tools did you work with, and how did you apply them?"
• "How did you collaborate with other teams or stakeholders?"

Remember: You're conducting a professional interview to understand their career depth.
Be warm, engaged, and help them showcase their best experiences."""
```

### Required Experience Data
```javascript
// Pass specific experience to enhance
experienceData: {
  title: "Senior Software Engineer",
  company: "TechCorp",
  startDate: "2020-01-01",
  endDate: "2023-12-31",
  description: "Led development of cloud infrastructure...",
  isCurrentRole: false
}
```

### Tool Queries
```python
# Experience-specific queries
queries = [
    "responsibilities at [company]",
    "team size and structure",
    "technologies used",
    "major projects",
    "challenges faced",
    "achievements and impact",
    "collaboration examples"
]
```

### Frontend Integration
```tsx
<ProfileLiveKitInterviewDialog
  interviewType="experience_enhancement"
  candidateData={profileData}
  experienceData={selectedExperience}  // Pass specific experience
/>
```

### Post-Processing
```javascript
// Extract achievements from transcript
const achievements = await extractAchievements({
  transcript,
  experienceData
});

// Generate interview brief
const interviewBrief = await generateInterviewBrief(transcript);

// Returns structured achievements:
{
  achievements: [
    { text: "Led team of 10 engineers...", category: "leadership" },
    { text: "Reduced deployment time by 50%", category: "technical" }
  ],
  summary: {
    totalAchievements: 5,
    dominantCategories: ["technical", "leadership"]
  }
}
```

## Proposed New Interview Types

## 3. Work Style & Career Goals Interview (`work_style_and_goals`)

### Purpose
Combined interview exploring candidate's work preferences, collaboration approach, AND career aspirations in a single conversation

### System Prompt
```python
system_prompt = f"""You are {candidate_name} discussing your work style, collaboration approach, and career goals.

ROLE: You are the CANDIDATE being interviewed about how you work and your professional aspirations.

PART 1 - WORK STYLE FOCUS:
• Team collaboration and communication style
• Problem-solving methodology
• Work environment preferences (remote/hybrid/office)
• Leadership and mentoring approach
• Conflict resolution strategies
• Time management and prioritization methods
• Meeting and documentation preferences
• Feedback culture and continuous improvement

PART 2 - CAREER GOALS FOCUS:
• Short-term goals (next 1-2 years)
• Mid-term objectives (3-5 years)
• Long-term career vision (5+ years)
• Skills you want to develop
• Industries or domains of interest
• Leadership aspirations
• Learning and development priorities
• Impact you want to make

EXAMPLE RESPONSES:
Work Style:
• "I thrive in collaborative environments where ideas flow freely..."
• "My approach to problem-solving typically starts with understanding the root cause..."
• "I prefer async communication for deep work, but value real-time collaboration..."

Career Goals:
• "In the next year, I'm focused on deepening my expertise in cloud architecture..."
• "My five-year vision includes transitioning into technical leadership..."
• "Long-term, I see myself driving innovation in sustainable technology..."

CRITICAL: Use getCandidateFacts to retrieve relevant examples and connect your work style with your career trajectory.

CONVERSATION STYLE:
• Share specific examples from past experiences
• Show how your work style supports your career goals
• Be authentic about preferences while showing adaptability
• Connect current skills with future aspirations
• Express enthusiasm for growth and learning
• Balance immediate contributions with long-term vision"""
```

### Tool Queries
```python
# Combined queries for work style and career goals
queries = [
    # Work style queries
    "team collaboration examples",
    "leadership experience",
    "remote work experience",
    "project management approach",
    "communication preferences",
    "conflict resolution examples",
    # Career goals queries
    "career progression history",
    "skill development over time",
    "leadership aspirations",
    "industry expertise",
    "certifications and learning",
    "mentorship experiences",
    "growth opportunities"
]
```

### Frontend Integration
```tsx
// In the Work Style & Career Goals tab
<ProfileLiveKitInterviewDialog
  interviewType="work_style_and_goals"
  candidateData={candidateData}
  onInterviewComplete={(data) => {
    // Handle both work style and career insights
    updateWorkStyleInsights(data.workStyle);
    updateCareerGoalsInsights(data.careerGoals);
  }}
/>
```

### Post-Processing
```javascript
// Extract combined insights from single interview
async function generateWorkStyleAndGoalsInsights(transcript) {
  const prompt = `Analyze this combined work style and career goals interview.

  Extract TWO distinct sets of insights:

  WORK STYLE INSIGHTS:
  1. Collaboration preferences (team vs independent)
  2. Communication style (sync vs async, formal vs casual)
  3. Work environment preference (remote, hybrid, office)
  4. Problem-solving approach
  5. Leadership and mentoring style
  6. Conflict resolution approach
  7. Time management methods

  CAREER GOALS INSIGHTS:
  1. Short-term goals (1-2 years)
  2. Mid-term objectives (3-5 years)
  3. Long-term vision (5+ years)
  4. Skills development priorities
  5. Industry interests
  6. Leadership aspirations
  7. Learning mindset indicators

  Return as JSON with both sections and specific examples.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "Interview analyzer for work style and career goals" },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

// Expected output structure
{
  "workStyle": {
    "collaborationPreference": "Balanced - values both team and independent work",
    "communicationStyle": "Prefers async for deep work, sync for brainstorming",
    "workEnvironment": "Hybrid with flexibility",
    "problemSolving": "Data-driven with stakeholder input",
    "leadership": "Servant leader, focuses on team enablement",
    "conflictResolution": "Direct but empathetic approach",
    "timeManagement": "Time-blocking with priority matrix",
    "examples": ["Led remote team of 10...", "Implemented agile processes..."]
  },
  "careerGoals": {
    "shortTerm": ["Master cloud architecture", "Lead larger teams"],
    "midTerm": ["Move to senior leadership", "Drive technical strategy"],
    "longTerm": ["CTO role", "Technical thought leader"],
    "skillsDevelopment": ["AI/ML", "Business strategy", "Public speaking"],
    "industryInterests": ["FinTech", "HealthTech"],
    "leadershipAspiration": "Technical executive leading innovation",
    "learningApproach": "Continuous learner through courses and mentorship",
    "alignmentScore": 4.5
  },
  "overallRecommendation": "Strong candidate with clear growth trajectory and adaptable work style"
}
```

### Processing Focus
- Extract BOTH work preferences AND career aspirations from single transcript
- Identify how work style aligns with career goals
- Assess cultural fit based on work preferences
- Evaluate growth potential based on career aspirations
- Determine retention likelihood from goal alignment

## 5. Technical Deep Dive (`technical_assessment`)

### Purpose
Detailed technical discussion about specific technologies and architectures

### System Prompt
```python
system_prompt = f"""You are {candidate_name} in a technical interview discussing your expertise.

ROLE: You are the CANDIDATE demonstrating technical knowledge and experience.

FOCUS AREAS:
• System design and architecture decisions
• Technology stack choices and trade-offs
• Performance optimization experiences
• Debugging and troubleshooting approaches
• Code quality and best practices
• Security considerations
• Scalability challenges
• Technical innovation and research

DISCUSSION APPROACH:
• Explain technical concepts clearly
• Share real implementation examples
• Discuss trade-offs and decision-making
• Admit knowledge gaps honestly
• Show enthusiasm for technical challenges
• Demonstrate continuous learning

CRITICAL: Use getCandidateFacts for specific project details and technologies used."""
```

### Tool Queries
```python
# Technical assessment specific queries
queries = [
    "programming languages",
    "frameworks and libraries",
    "cloud platforms experience",
    "database technologies",
    "architecture patterns used",
    "performance optimization examples",
    "debugging experiences",
    "security implementations",
    "CI/CD pipelines",
    "testing strategies",
    "code review practices",
    "technical certifications",
    "open source contributions",
    "technical mentorship"
]

# Example tool response structure
{
    "found": True,
    "facts": [
        "Expert in Python, JavaScript, TypeScript",
        "Experienced with React, Node.js, Django",
        "AWS certified, worked with GCP",
        "Optimized database queries reducing load by 60%",
        "Implemented microservices architecture at scale"
    ]
}
```

### Frontend Integration
```tsx
<ProfileLiveKitInterviewDialog
  interviewType="technical_assessment"
  candidateData={candidateData}
  // Optional: Pass specific technical area to focus on
  technicalContext={{
    focusArea: "backend", // or "frontend", "fullstack", "devops"
    technologies: ["Python", "AWS", "PostgreSQL"],
    level: "senior" // junior, mid, senior, principal
  }}
/>
```

### Post-Processing
```javascript
// Extract technical proficiency insights
async function generateTechnicalInsights(transcript) {
  const prompt = `Analyze this technical interview and extract:
  1. Technologies discussed with proficiency level (1-5)
  2. System design understanding depth
  3. Problem-solving approach and clarity
  4. Code quality awareness
  5. Technical communication skills
  6. Areas of expertise vs gaps
  7. Learning mindset indicators

  Return as JSON with specific examples and scores.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "Technical interview analyzer" },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

// Expected output structure
{
  "technicalProficiency": {
    "languages": [
      { "name": "Python", "level": 4, "evidence": "Discussed async patterns..." }
    ],
    "frameworks": [...],
    "concepts": [...]
  },
  "systemDesign": {
    "score": 4,
    "strengths": ["Scalability consideration", "Trade-off analysis"],
    "gaps": ["Cost optimization"]
  },
  "problemSolving": {
    "approach": "Methodical",
    "complexity": "Can handle complex systems",
    "examples": [...]
  },
  "overallTechnicalScore": 85,
  "recommendation": "Strong technical candidate for senior role"
}
```

### Processing Focus
- Map technical skills to job requirements
- Assess depth vs breadth of knowledge
- Identify technical leadership potential
- Evaluate problem-solving methodology
- Determine technical communication ability

## 6. Cultural Fit Interview (`cultural_fit`)

### Purpose
Assess alignment with company values and culture

### System Prompt
```python
system_prompt = f"""You are {candidate_name} discussing values and cultural alignment.

ROLE: You are the CANDIDATE sharing your values and work philosophy.

FOCUS AREAS:
• Core professional values
• Ideal company culture
• Diversity and inclusion perspectives
• Work-life balance views
• Team building and morale
• Company mission alignment
• Ethical considerations in work
• Community involvement

AUTHENTIC SHARING:
• Be genuine about your values
• Share examples of values in action
• Discuss what motivates you
• Explain what environments help you thrive
• Show cultural awareness and adaptability"""
```

### Tool Queries
```python
# Cultural fit specific queries
queries = [
    "work values",
    "team experiences",
    "leadership philosophy",
    "diversity and inclusion examples",
    "conflict resolution approach",
    "work-life balance preferences",
    "motivation drivers",
    "ethical decisions",
    "volunteer work",
    "company culture preferences",
    "feedback culture",
    "continuous improvement mindset"
]

# Example tool response structure
{
    "found": True,
    "facts": [
        "Values transparency and open communication",
        "Led diversity initiatives at previous company",
        "Prefers collaborative decision-making",
        "Volunteers for STEM education programs",
        "Motivated by impact and innovation"
    ]
}
```

### Frontend Integration
```tsx
<ProfileLiveKitInterviewDialog
  interviewType="cultural_fit"
  candidateData={candidateData}
  // Optional: Pass company values for alignment
  companyContext={{
    values: ["Innovation", "Collaboration", "Integrity"],
    culture: "Fast-paced startup environment",
    mission: "Making technology accessible to all"
  }}
/>
```

### Post-Processing
```javascript
// Extract cultural alignment insights
async function generateCulturalFitInsights(transcript) {
  const prompt = `Analyze this cultural fit interview and extract:
  1. Core values expressed by candidate
  2. Work environment preferences
  3. Team collaboration style
  4. Leadership and mentorship approach
  5. Diversity and inclusion awareness
  6. Work-life balance priorities
  7. Mission alignment indicators

  Return as JSON with specific examples and alignment score.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "Cultural fit analyzer" },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

// Expected output structure
{
  "coreValues": [
    { "value": "Transparency", "evidence": "Emphasized open communication..." },
    { "value": "Innovation", "evidence": "Discussed driving change..." }
  ],
  "workEnvironment": {
    "preference": "Collaborative with autonomy",
    "flexibility": "High",
    "remoteWork": "Hybrid preferred"
  },
  "teamDynamics": {
    "style": "Supportive collaborator",
    "conflictResolution": "Direct but empathetic",
    "mentorship": "Active mentor and mentee"
  },
  "culturalAlignment": {
    "score": 4.2,
    "strengths": ["Values match", "Growth mindset"],
    "considerations": ["Pace adjustment needed"]
  },
  "recommendation": "Strong cultural fit with minor onboarding focus areas"
}
```

### Processing Focus
- Match candidate values with company values
- Assess adaptability to company culture
- Evaluate team fit potential
- Identify cultural contribution opportunities
- Determine long-term retention likelihood

## Implementation Checklist for New Types

### Backend Requirements
- [ ] Add interview type to enum/constants
- [ ] Update metadata structure
- [ ] Create processing function
- [ ] Add database fields
- [ ] Test API endpoint

### Agent Requirements
- [ ] Add system prompt condition
- [ ] Extend tool queries
- [ ] Test with console
- [ ] Verify metadata reception
- [ ] Check transcript quality

### Frontend Requirements
- [ ] Create trigger component
- [ ] Pass correct interview type
- [ ] Handle specific experience data
- [ ] Display appropriate UI
- [ ] Process completion correctly

### Processing Requirements
- [ ] Create insight extraction logic
- [ ] Define output structure
- [ ] Test with sample transcripts
- [ ] Validate JSON responses
- [ ] Handle edge cases

## Best Practices for New Interview Types

### 1. System Prompt Design
- Start with role clarity
- Define clear focus areas
- Include example responses
- Specify conversation style
- Add guidelines and boundaries

### 2. Tool Integration
- Map queries to data structure
- Provide fallback responses
- Cache frequent queries
- Handle missing data gracefully

### 3. Processing Logic
- Define clear metrics
- Extract actionable insights
- Maintain consistency
- Validate output structure
- Handle errors gracefully

### 4. Testing Strategy
- Test each role separately
- Verify data flow
- Check edge cases
- Validate transcripts
- Monitor performance

### 5. User Experience
- Clear type descriptions
- Appropriate UI changes
- Progress indicators
- Error messages
- Success feedback

## Monitoring and Analytics

### Key Metrics by Type
```javascript
const metrics = {
  general: ['duration', 'questions_asked', 'topics_covered'],
  experience_enhancement: ['achievements_extracted', 'follow_ups_asked'],
  work_style: ['preferences_identified', 'collaboration_examples'],
  career_goals: ['goals_articulated', 'alignment_score'],
  technical_assessment: ['technologies_discussed', 'depth_score'],
  cultural_fit: ['values_expressed', 'culture_match']
};
```

### Success Criteria
1. **Completion Rate**: >90% interviews completed
2. **Transcript Quality**: Coherent, relevant responses
3. **Insight Extraction**: Meaningful, actionable insights
4. **User Satisfaction**: Positive feedback on experience
5. **Technical Performance**: <500ms latency, clear audio

## Future Enhancements

### Planned Features
1. **Multi-language Support**: Interviews in different languages
2. **Adaptive Questioning**: AI adjusts based on responses
3. **Skill Assessment**: Technical challenges during interview
4. **Personality Analysis**: Behavioral assessment integration
5. **Video Interviews**: Add video capability
6. **Group Interviews**: Multiple participants
7. **Async Interviews**: Record and review later
8. **Interview Coaching**: Practice mode for candidates

### Integration Opportunities
1. **ATS Integration**: Direct sync with applicant tracking
2. **Calendar Scheduling**: Automated interview scheduling
3. **Assessment Platforms**: Combine with coding tests
4. **Reference Checks**: Automated reference interviews
5. **Onboarding**: Post-hire interview sessions