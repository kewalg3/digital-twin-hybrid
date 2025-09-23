/**
 * Fallback Resume Parser
 * Simple text-based parsing when TextKernel API fails
 * Uses regex patterns to extract common resume information
 */

class FallbackResumeParser {
  constructor() {
    console.log('🔧 Fallback Resume Parser initialized');
  }

  /**
   * Parse resume using basic text analysis
   */
  async parseResume(resumeBuffer, filename) {
    console.log('📄 Using fallback parser for:', filename);
    
    try {
      // Convert buffer to text and sanitize null characters for PostgreSQL
      const resumeText = resumeBuffer.toString('utf-8').replace(/\u0000/g, '');
      
      console.log('📝 Resume text length:', resumeText.length, 'characters');
      
      // Extract basic information
      const extractedName = this.extractName(resumeText);
      const extractedEmail = this.extractEmail(resumeText);
      const extractedPhone = this.extractPhone(resumeText);
      const skills = this.extractSkills(resumeText);
      const experience = this.extractExperience(resumeText);
      const education = this.extractEducation(resumeText);
      
      console.log('✅ Fallback parsing completed');
      console.log('- Name:', extractedName || 'Not found');
      console.log('- Email:', extractedEmail || 'Not found');
      console.log('- Phone:', extractedPhone || 'Not found');
      console.log('- Skills found:', skills.length);
      
      return {
        // Complete parsed data structure
        parsedContent: {
          personalInfo: {
            firstName: extractedName?.split(' ')[0] || '',
            lastName: extractedName?.split(' ').slice(1).join(' ') || '',
            fullName: extractedName || '',
            email: extractedEmail || '',
            phone: extractedPhone || '',
            address: '',
            city: '',
            state: '',
            country: '',
            zipCode: '',
            linkedinUrl: this.extractLinkedIn(resumeText)
          },
          education: education,
          experiences: experience,
          skills: skills.map(skill => ({
            name: skill,
            category: 'technical',
            monthsExperience: 0,
            lastUsed: null
          })),
          certifications: [],
          professionalSummary: this.extractSummary(resumeText),
          totalExperienceMonths: this.calculateTotalExperience(experience),
          rawData: { fallbackParsed: true }
        },
        
        // Quick access fields
        extractedName: extractedName || '',
        extractedEmail: extractedEmail || '',
        extractedPhone: extractedPhone || '',
        extractedAddress: '',
        
        // Raw text
        rawText: resumeText,
        
        // Arrays for database storage
        skillsExtracted: skills,
        
        // Experience summary
        totalExperience: this.calculateTotalExperience(experience),
        industryType: '',
        
        // For backward compatibility
        skills: JSON.stringify(skills),
        jobTitles: JSON.stringify(experience.map(exp => exp.jobTitle).filter(Boolean)),
        experienceYears: Math.floor(this.calculateTotalExperience(experience) / 12)
      };
      
    } catch (error) {
      console.error('❌ Fallback parser error:', error);
      throw new Error(`Fallback resume parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract name from resume text
   */
  extractName(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    // Look for name in first few lines (exclude email/phone lines)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      
      // Skip lines that look like email or phone
      if (/@/.test(line) || /\d{3}[.-]\d{3}[.-]\d{4}/.test(line)) continue;
      
      // Look for name pattern (2-4 words, mostly alphabetic)
      const namePattern = /^([A-Za-z]+(?:\s+[A-Za-z]+){1,3})$/;
      const match = line.match(namePattern);
      
      if (match && line.length > 5 && line.length < 50) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  /**
   * Extract email address
   */
  extractEmail(text) {
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = text.match(emailPattern);
    return match ? match[1] : null;
  }

  /**
   * Extract phone number
   */
  extractPhone(text) {
    const phonePatterns = [
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,  // US format
      /\+\d{1,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/,  // International
      /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/  // Simple format
    ];
    
    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
    
    return null;
  }

  /**
   * Extract LinkedIn URL
   */
  extractLinkedIn(text) {
    const linkedinPattern = /(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+/;
    const match = text.match(linkedinPattern);
    return match ? match[0] : null;
  }

  /**
   * Extract skills from resume text
   */
  extractSkills(text) {
    // Common technical skills to look for
    const skillKeywords = [
      // Programming languages
      'javascript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift',
      'typescript', 'kotlin', 'scala', 'r', 'matlab', 'perl', 'shell', 'bash',
      
      // Web technologies
      'html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 'jquery',
      'bootstrap', 'sass', 'less', 'webpack', 'gulp', 'grunt',
      
      // Databases
      'mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'sql server',
      'dynamodb', 'cassandra', 'elasticsearch',
      
      // Cloud & DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
      'jenkins', 'gitlab', 'github', 'git', 'ci/cd', 'devops',
      
      // Frameworks & Libraries
      'spring', 'django', 'flask', 'laravel', 'rails', 'express.js', 'next.js',
      'vue.js', 'angular.js', 'backbone.js',
      
      // Tools & Software
      'jira', 'confluence', 'slack', 'trello', 'asana', 'figma', 'sketch',
      'photoshop', 'illustrator', 'after effects', 'premiere',
      
      // Data & Analytics
      'pandas', 'numpy', 'matplotlib', 'tensorflow', 'pytorch', 'scikit-learn',
      'tableau', 'power bi', 'excel', 'google analytics',
      
      // Other technical
      'api', 'rest', 'graphql', 'microservices', 'agile', 'scrum', 'kanban',
      'testing', 'unit testing', 'integration testing', 'tdd', 'bdd'
    ];
    
    const textLower = text.toLowerCase();
    const foundSkills = new Set();
    
    // Look for skills in the text
    for (const skill of skillKeywords) {
      // Escape special regex characters properly
      const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedSkill}\\b`, 'i');
      if (pattern.test(textLower)) {
        foundSkills.add(skill);
      }
    }
    
    // Look for skills in common sections
    const skillsSections = this.extractSection(text, ['skills', 'technical skills', 'technologies', 'expertise']);
    
    if (skillsSections) {
      const skillsText = skillsSections.toLowerCase();
      // Extract comma-separated or bullet-pointed skills
      const additionalSkills = skillsText
        .split(/[,•·\n-]/)
        .map(skill => skill.trim())
        .filter(skill => skill.length > 2 && skill.length < 30)
        .filter(skill => /^[a-zA-Z0-9.\s#+]+$/.test(skill));
        
      additionalSkills.forEach(skill => foundSkills.add(skill));
    }
    
    return Array.from(foundSkills).slice(0, 20); // Limit to 20 skills
  }

  /**
   * Extract work experience
   */
  extractExperience(text) {
    const experiences = [];
    
    // Look for experience section
    const expSection = this.extractSection(text, [
      'experience', 'work experience', 'employment', 'career history',
      'professional experience', 'work history'
    ]);
    
    if (!expSection) {
      return experiences;
    }
    
    // Split by potential job entries (look for year patterns)
    const yearPattern = /\b(19|20)\d{2}\b/g;
    const lines = expSection.split('\n').filter(line => line.trim());
    
    let currentJob = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Look for job title patterns (often the first line of a job entry)
      if (this.looksLikeJobTitle(trimmedLine)) {
        // Save previous job if exists
        if (currentJob) {
          experiences.push(currentJob);
        }
        
        // Start new job
        currentJob = {
          jobTitle: trimmedLine,
          company: '',
          location: '',
          startDate: null,
          endDate: null,
          isCurrentRole: false,
          description: '',
          displayOrder: experiences.length
        };
      } else if (currentJob && this.looksLikeCompany(trimmedLine)) {
        currentJob.company = trimmedLine;
      } else if (currentJob && yearPattern.test(trimmedLine)) {
        // Extract dates
        const dates = this.extractDatesFromLine(trimmedLine);
        if (dates.start) currentJob.startDate = dates.start;
        if (dates.end) currentJob.endDate = dates.end;
        if (dates.isCurrent) currentJob.isCurrentRole = true;
      } else if (currentJob && trimmedLine.length > 20) {
        // Add to description
        currentJob.description += (currentJob.description ? '\n' : '') + trimmedLine;
      }
    }
    
    // Add the last job
    if (currentJob) {
      experiences.push(currentJob);
    }
    
    return experiences.slice(0, 10); // Limit to 10 experiences
  }

  /**
   * Extract education information
   */
  extractEducation(text) {
    const education = [];
    
    const eduSection = this.extractSection(text, [
      'education', 'academic background', 'qualifications', 'degrees'
    ]);
    
    if (!eduSection) {
      return education;
    }
    
    const lines = eduSection.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (this.looksLikeDegree(trimmedLine)) {
        const eduEntry = {
          degree: trimmedLine,
          institution: '',
          graduationDate: null,
          gpa: null,
          location: ''
        };
        
        // Look for year in the same line or next lines
        const yearMatch = trimmedLine.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          eduEntry.graduationDate = yearMatch[0];
        }
        
        education.push(eduEntry);
      }
    }
    
    return education.slice(0, 5); // Limit to 5 education entries
  }

  /**
   * Extract professional summary
   */
  extractSummary(text) {
    const summarySection = this.extractSection(text, [
      'summary', 'profile', 'about', 'overview', 'professional summary',
      'career objective', 'objective'
    ]);
    
    if (summarySection) {
      return summarySection.substring(0, 500); // Limit summary length
    }
    
    // If no summary section, take first paragraph after name/contact
    const lines = text.split('\n').filter(line => line.trim());
    let summaryStart = -1;
    
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip contact information lines
      if (/@/.test(line) || /\d{3}[.-]\d{3}[.-]\d{4}/.test(line)) continue;
      
      // Look for paragraph-like content
      if (line.length > 50 && !this.looksLikeJobTitle(line)) {
        summaryStart = i;
        break;
      }
    }
    
    if (summaryStart >= 0) {
      const summaryLines = [];
      for (let i = summaryStart; i < Math.min(summaryStart + 5, lines.length); i++) {
        const line = lines[i].trim();
        if (line.length > 20) {
          summaryLines.push(line);
        }
      }
      return summaryLines.join(' ').substring(0, 500);
    }
    
    return '';
  }

  /**
   * Extract specific section from resume text
   */
  extractSection(text, sectionNames) {
    const lines = text.split('\n');
    let sectionStart = -1;
    let sectionEnd = -1;
    
    // Find section start
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim().toLowerCase();
      
      for (const sectionName of sectionNames) {
        if (line === sectionName || line.startsWith(sectionName + ':') || 
            line.startsWith(sectionName + ' ')) {
          sectionStart = i + 1;
          break;
        }
      }
      
      if (sectionStart >= 0) break;
    }
    
    if (sectionStart < 0) return null;
    
    // Find section end (next section or end of document)
    const commonSections = [
      'experience', 'education', 'skills', 'projects', 'certifications',
      'achievements', 'awards', 'references', 'interests', 'hobbies'
    ];
    
    for (let i = sectionStart; i < lines.length; i++) {
      const line = lines[i].trim().toLowerCase();
      
      for (const section of commonSections) {
        if (line === section || line.startsWith(section + ':')) {
          sectionEnd = i;
          break;
        }
      }
      
      if (sectionEnd >= 0) break;
    }
    
    if (sectionEnd < 0) sectionEnd = lines.length;
    
    return lines.slice(sectionStart, sectionEnd).join('\n').trim();
  }

  /**
   * Helper methods
   */
  looksLikeJobTitle(text) {
    const jobTitleKeywords = [
      'engineer', 'developer', 'manager', 'director', 'analyst', 'specialist',
      'coordinator', 'consultant', 'architect', 'lead', 'senior', 'junior',
      'associate', 'assistant', 'intern', 'supervisor', 'executive', 'officer'
    ];
    
    const textLower = text.toLowerCase();
    return jobTitleKeywords.some(keyword => textLower.includes(keyword)) &&
           text.length > 5 && text.length < 100;
  }

  looksLikeCompany(text) {
    const companyKeywords = [
      'inc', 'llc', 'corp', 'company', 'corporation', 'ltd', 'limited',
      'group', 'solutions', 'systems', 'technologies', 'services'
    ];
    
    const textLower = text.toLowerCase();
    return (companyKeywords.some(keyword => textLower.includes(keyword)) ||
           (text.length > 3 && text.length < 80 && /^[A-Z]/.test(text))) &&
           !/@/.test(text) && !/\d{3}[.-]\d{3}[.-]\d{4}/.test(text);
  }

  looksLikeDegree(text) {
    const degreeKeywords = [
      'bachelor', 'master', 'phd', 'doctorate', 'diploma', 'certificate',
      'b.s.', 'b.a.', 'm.s.', 'm.a.', 'mba', 'degree', 'university', 'college'
    ];
    
    const textLower = text.toLowerCase();
    return degreeKeywords.some(keyword => textLower.includes(keyword)) &&
           text.length > 5 && text.length < 150;
  }

  extractDatesFromLine(line) {
    const dates = { start: null, end: null, isCurrent: false };
    
    // Look for current indicators
    if (/present|current|now/i.test(line)) {
      dates.isCurrent = true;
    }
    
    // Extract year patterns
    const yearMatches = line.match(/\b(19|20)\d{2}\b/g);
    if (yearMatches) {
      if (yearMatches.length >= 2) {
        dates.start = yearMatches[0];
        dates.end = yearMatches[1];
      } else if (yearMatches.length === 1) {
        if (dates.isCurrent) {
          dates.start = yearMatches[0];
        } else {
          dates.end = yearMatches[0];
        }
      }
    }
    
    return dates;
  }

  calculateTotalExperience(experiences) {
    let totalMonths = 0;
    
    for (const exp of experiences) {
      if (exp.startDate && exp.endDate) {
        const startYear = parseInt(exp.startDate);
        const endYear = parseInt(exp.endDate);
        if (!isNaN(startYear) && !isNaN(endYear)) {
          totalMonths += (endYear - startYear + 1) * 12;
        }
      } else if (exp.startDate && exp.isCurrentRole) {
        const startYear = parseInt(exp.startDate);
        const currentYear = new Date().getFullYear();
        if (!isNaN(startYear)) {
          totalMonths += (currentYear - startYear + 1) * 12;
        }
      }
    }
    
    return totalMonths;
  }
}

module.exports = new FallbackResumeParser();