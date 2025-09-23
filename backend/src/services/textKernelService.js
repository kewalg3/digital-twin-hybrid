const axios = require('axios');
require('dotenv').config();

class TextKernelService {
  constructor() {
    this.apiKey = process.env.TEXT_KERNEL_API_KEY;
    this.accountId = process.env.TEXT_KERNEL_ACCOUNT_ID;
    this.baseUrl = 'https://api.textkernel.com/tx/v10'; // PRODUCTION URL
    
    if (!this.apiKey) {
      console.warn('TEXT_KERNEL_API_KEY not provided. Resume parsing will be disabled.');
    }
    
    console.log('🔧 TextKernel Service Initialized:');
    console.log('- API Key exists:', !!this.apiKey);
    console.log('- Account ID exists:', !!this.accountId);
    console.log('- Base URL:', this.baseUrl);
  }

  async parseResume(resumeBuffer, filename) {
    console.log('\n=== TEXTKERNEL DEBUG START ===');
    console.log('🔑 API Key exists:', !!this.apiKey);
    console.log('🔑 Account ID:', this.accountId);
    console.log('📁 File received:', filename);
    console.log('📁 Buffer size:', resumeBuffer?.length, 'bytes');
    
    if (!this.apiKey) {
      console.log('❌ No API key configured');
      throw new Error('TextKernel API key not configured. Please check TEXT_KERNEL_API_KEY environment variable.');
    }

    try {
      const base64Resume = resumeBuffer.toString('base64');
      // Use YYYY-MM-DD format as required by TextKernel API
      const currentDate = new Date().toISOString().split('T')[0];
      
      console.log('📅 Document date:', currentDate);
      console.log('📄 Base64 length:', base64Resume.length, 'characters');
      
      // Simplified payload - only required fields for v10 API
      const payload = {
        DocumentAsBase64String: base64Resume,
        DocumentLastModified: currentDate,
        // Only include essential options
        OutputHtml: true,
        OutputPdf: false,
        Configuration: "Coverage.PersonalInformation = true; Coverage.EducationHistory = true; Coverage.EmploymentHistory = true; Coverage.SkillsData = true",
        SkillsSettings: {
          Normalize: true,
          TaxonomyVersion: "v2"
        },
        ProfessionsSettings: {
          Normalize: true
        }
      };

      const requestUrl = `${this.baseUrl}/parser/resume`;
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Sovren-AccountId': this.accountId,
        'Sovren-ServiceKey': this.apiKey
      };
      
      console.log('🌐 Request URL:', requestUrl);
      console.log('📋 Request Headers:', Object.keys(headers).reduce((acc, key) => {
        acc[key] = key.includes('Key') ? '[REDACTED]' : headers[key];
        return acc;
      }, {}));
      console.log('📦 Payload size:', JSON.stringify(payload).length, 'characters');
      
      console.log('🚀 Making API request to TextKernel...');
      const response = await axios.post(requestUrl, payload, {
        headers,
        timeout: 30000 // 30 seconds timeout
      });

      console.log('✅ Response received from TextKernel');
      console.log('📊 Response status:', response.status);
      console.log('📄 Response data keys:', Object.keys(response.data || {}));
      
      if (response.data?.Info?.Code !== 'Success') {
        console.log('❌ TextKernel API returned error:');
        console.log('- Code:', response.data?.Info?.Code);
        console.log('- Message:', response.data?.Info?.Message);
        console.log('- Full response:', JSON.stringify(response.data, null, 2));
        throw new Error(`TextKernel API Error: ${response.data?.Info?.Message || 'Unknown error'}`);
      }

      console.log('✅ TextKernel parsing successful');
      console.log('=== TEXTKERNEL DEBUG END ===\n');
      return this.extractResumeData(response.data.Value);
      
    } catch (error) {
      console.log('❌ TextKernel Error Details:');
      console.log('- Error type:', error.constructor.name);
      console.log('- Error message:', error.message);
      console.log('- Status:', error.response?.status);
      console.log('- Status text:', error.response?.statusText);
      
      // Log full error response for debugging
      if (error.response?.data) {
        console.log('- Response body:', JSON.stringify(error.response.data, null, 2));
        
        // Extract specific error message from TextKernel response
        const tkError = error.response.data?.Info?.Message || error.response.data?.message || error.response.data;
        console.log('- TextKernel error:', tkError);
        
        // Check for specific error codes
        if (error.response.status === 400) {
          if (typeof tkError === 'string' && tkError.includes('document')) {
            throw new Error('Invalid document format. Please upload a valid PDF or DOCX file.');
          } else if (typeof tkError === 'string' && tkError.includes('base64')) {
            throw new Error('File encoding error. Please try uploading again.');
          }
        } else if (error.response.status === 401) {
          throw new Error('TextKernel authentication failed. Please check API credentials.');
        } else if (error.response.status === 429) {
          console.log('⚠️  TextKernel rate limit hit, falling back to basic parsing');
          throw new Error('TEXTKERNEL_RATE_LIMIT'); // Special error for fallback handling
        }
      }
      
      console.log('=== TEXTKERNEL DEBUG END ===\n');
      
      // Throw detailed error for better debugging
      const errorMessage = error.response?.data?.Info?.Message || 
                          error.response?.data?.message || 
                          error.message || 
                          'Unknown TextKernel API error';
      
      throw new Error(`TextKernel API Error (${error.response?.status || 'Unknown'}): ${errorMessage}`);
    }
  }

  extractResumeData(parsedData) {
    const resume = parsedData.ResumeData;
    
    // Extract personal information
    const personalInfo = {
      firstName: resume.ContactInformation?.CandidateName?.GivenName || '',
      lastName: resume.ContactInformation?.CandidateName?.FamilyName || '',
      fullName: resume.ContactInformation?.CandidateName?.FormattedName || '',
      email: this.extractEmail(resume.ContactInformation),
      phone: this.extractPhone(resume.ContactInformation),
      address: this.extractAddress(resume.ContactInformation),
      city: resume.ContactInformation?.Location?.Municipality || '',
      state: resume.ContactInformation?.Location?.Regions?.[0] || '',
      country: resume.ContactInformation?.Location?.CountryCode || '',
      zipCode: resume.ContactInformation?.Location?.PostalCode || '',
      linkedinUrl: this.extractLinkedIn(resume.ContactInformation),
    };

    // Extract skills (both raw and normalized)
    const skills = [];
    
    // Add raw skills
    if (resume.Skills?.Raw) {
      resume.Skills.Raw.forEach(skill => {
        skills.push({
          name: skill.Name,
          category: 'raw',
          monthsExperience: skill.MonthsExperience?.Value || 0,
          lastUsed: skill.LastUsed?.Value || null
        });
      });
    }

    // Add normalized skills
    if (resume.Skills?.Normalized) {
      resume.Skills.Normalized.forEach(skill => {
        skills.push({
          name: skill.Name,
          category: skill.Type || 'technical',
          monthsExperience: skill.MonthsExperience?.Value || 0,
          lastUsed: skill.LastUsed?.Value || null,
          id: skill.Id
        });
      });
    }

    // Extract employment history
    const experiences = [];
    if (resume.EmploymentHistory?.Positions) {
      resume.EmploymentHistory.Positions.forEach((position, index) => {
        experiences.push({
          jobTitle: position.JobTitle?.Raw || '',
          company: position.Employer?.Name?.Raw || '',
          location: this.extractJobLocation(position.Employer?.Location),
          startDate: position.StartDate?.Date || null,
          endDate: position.EndDate?.Date || null,
          isCurrentRole: position.IsCurrent || false,
          description: position.Description || '',
          displayOrder: index
        });
      });
    }

    // Extract education
    const education = [];
    if (resume.Education?.EducationDetails) {
      resume.Education.EducationDetails.forEach(edu => {
        education.push({
          degree: edu.Degree?.Name?.Raw || '',
          institution: edu.SchoolName?.Raw || '',
          graduationDate: edu.LastEducationDate?.Date || null,
          gpa: edu.GPA?.Score || null,
          location: this.extractJobLocation(edu.Location)
        });
      });
    }

    // Extract certifications
    const certifications = [];
    if (resume.Certifications) {
      resume.Certifications.forEach(cert => {
        certifications.push({
          name: cert.Name,
          normalizedName: cert.NormalizedName || cert.Name
        });
      });
    }

    // Calculate total experience
    const totalExperienceMonths = resume.EmploymentHistory?.ExperienceSummary?.MonthsOfWorkExperience || 0;
    const experienceYears = Math.floor(totalExperienceMonths / 12);

    // Extract job titles for quick access
    const jobTitles = experiences.map(exp => exp.jobTitle).filter(title => title);

    // Extract skills for quick access
    const skillNames = skills.map(skill => skill.name).filter(name => name);

    return {
      // Complete parsed data
      parsedContent: {
        personalInfo,
        education,
        experiences,
        skills,
        certifications,
        professionalSummary: resume.ProfessionalSummary || '',
        totalExperienceMonths,
        rawData: parsedData
      },
      
      // Quick access fields
      extractedName: personalInfo.fullName,
      extractedEmail: personalInfo.email,
      extractedPhone: personalInfo.phone,
      extractedAddress: personalInfo.address,
      
      // Raw text
      rawText: resume.ResumeMetadata?.PlainText || '',
      
      // Arrays for database storage
      skillsExtracted: skillNames,
      
      // Experience summary (store in years, not months)
      totalExperience: experienceYears,
      industryType: resume.EmploymentHistory?.ExperienceSummary?.ExecutiveType || '',
      
      // For backward compatibility
      skills: JSON.stringify(skillNames),
      jobTitles: JSON.stringify(jobTitles),
      experienceYears,
      
      // Professional summary for direct access
      professionalSummary: resume.ProfessionalSummary || ''
    };
  }

  extractEmail(contactInfo) {
    if (contactInfo?.EmailAddresses?.length > 0) {
      return contactInfo.EmailAddresses[0];
    }
    return '';
  }

  extractPhone(contactInfo) {
    if (contactInfo?.Telephones?.length > 0) {
      return contactInfo.Telephones[0].Raw || contactInfo.Telephones[0].Normalized || '';
    }
    return '';
  }

  extractAddress(contactInfo) {
    if (contactInfo?.Location) {
      const location = contactInfo.Location;
      const parts = [];
      
      if (location.Municipality) parts.push(location.Municipality);
      if (location.Regions?.[0]) parts.push(location.Regions[0]);
      if (location.PostalCode) parts.push(location.PostalCode);
      if (location.CountryCode) parts.push(location.CountryCode);
      
      return parts.join(', ');
    }
    return '';
  }

  extractLinkedIn(contactInfo) {
    if (contactInfo?.WebAddresses) {
      const linkedIn = contactInfo.WebAddresses.find(addr => addr.Type === 'LinkedIn');
      return linkedIn?.Address || '';
    }
    return '';
  }

  extractJobLocation(location) {
    if (!location) return '';
    
    const parts = [];
    if (location.Municipality) parts.push(location.Municipality);
    if (location.Regions?.[0]) parts.push(location.Regions[0]);
    if (location.CountryCode) parts.push(location.CountryCode);
    
    return parts.join(', ');
  }

  async autocomplete(query, type = 'skills') {
    if (!this.apiKey) {
      throw new Error('Text Kernel API key not configured');
    }

    try {
      const payload = {
        Prefix: query,
        Limit: 10,
        Language: "en"
      };

      const response = await axios.post(
        `${this.baseUrl}/autocomplete`,
        payload,
        {
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Sovren-AccountId': process.env.TEXT_KERNEL_ACCOUNT_ID || '36467393',
            'Sovren-ServiceKey': this.apiKey
          },
          timeout: 10000
        }
      );

      if (response.data.Info.Code !== 'Success') {
        throw new Error(`Text Kernel autocomplete failed: ${response.data.Info.Message}`);
      }

      const suggestions = response.data.Value.Suggestions || [];
      
      return suggestions.map(suggestion => ({
        id: suggestion.Id,
        name: suggestion.Suggestion,
        type: suggestion.Type || type
      }));

    } catch (error) {
      console.error('Text Kernel autocomplete error:', error.message);
      throw new Error(`Autocomplete failed: ${error.message}`);
    }
  }
}

module.exports = new TextKernelService();