import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import FileUpload from "@/components/FileUpload";
import VoiceRecorder from "@/components/VoiceRecorder";
import ProfilePhotoUpload from "@/components/ProfilePhotoUpload";
import ExperienceCard from "@/components/ExperienceCard";
import WorkStyleInterviewDialog from "@/components/WorkStyleInterviewDialog";
import EVIInterviewDialog from "@/components/EVIInterviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Briefcase, Target, ChevronUp, ChevronDown, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { resumeApi, onboardingApi } from "@/services/api";
import { useAuthStore } from "@/store/authStore";

const TOTAL_STEPS = 5;

interface OnboardingData {
  resume?: File;
  voiceRecording?: Blob;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneCountry: string;
    streetAddress: string;
    city: string;
    stateProvince: string;
    zipPostalCode: string;
    country: string;
    linkedinProfile: string;
    githubProfile: string;
    portfolioWebsite: string;
    behanceProfile: string;
    dribbbleProfile: string;
    mediumProfile: string;
    twitterProfile: string;
    stackOverflowProfile: string;
  };
  profilePhoto?: File;
  workStyle: {
    careerGoals: string;
    workPreferences: string[];
    industries: string[];
  };
  skills: string[];
  verificationComplete: boolean;
}

export default function BetaOnboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  // Debug logging for component mount and user
  console.log('🚀 BetaOnboarding component loading for user:', {
    email: user?.email,
    userId: user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Check localStorage for auth data
  const storedAuth = localStorage.getItem('auth-storage');
  console.log('💾 Stored auth data:', storedAuth ? JSON.parse(storedAuth) : 'None');
  
  // Country code mapping function
  const mapCountryCode = (countryCode: string): string => {
    const countryMap: Record<string, string> = {
      'US': 'United States',
      'USA': 'United States',
      'CA': 'Canada',
      'CAN': 'Canada',
      'GB': 'United Kingdom',
      'UK': 'United Kingdom',
      'AU': 'Australia',
      'AUS': 'Australia',
      'DE': 'Germany',
      'DEU': 'Germany',
      'FR': 'France',
      'FRA': 'France',
      // Add more mappings as needed
    };
    
    if (!countryCode) return '';
    const upperCode = countryCode.toUpperCase();
    return countryMap[upperCode] || 'Other';
  };
  
  // Phone country code detection utility
  const detectCountryFromPhone = (phone: string): string => {
    if (!phone) return "+1";
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Common country code patterns
    if (digits.startsWith('1') && digits.length === 11) return "+1"; // US/Canada
    if (digits.startsWith('44')) return "+44"; // UK
    if (digits.startsWith('49')) return "+49"; // Germany
    if (digits.startsWith('33')) return "+33"; // France
    if (digits.startsWith('91')) return "+91"; // India
    if (digits.startsWith('86')) return "+86"; // China
    if (digits.startsWith('81')) return "+81"; // Japan
    if (digits.startsWith('61')) return "+61"; // Australia
    if (digits.startsWith('7')) return "+7";   // Russia
    if (digits.startsWith('55')) return "+55"; // Brazil
    
    // Default to US if can't detect
    return "+1";
  };
  
  // Add error state to prevent crashes
  const [hasError, setHasError] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [showWorkStyleDialog, setShowWorkStyleDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<'years' | 'lastUsed' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [parsedExperiences, setParsedExperiences] = useState<any[]>([]);
  const [parsedSkills, setParsedSkills] = useState<any[]>([]);
  const [skillsetsLoading, setSkillsetsLoading] = useState(false);
  const [databaseSkillsets, setDatabaseSkillsets] = useState<any[]>([]);
  const [databaseSoftware, setDatabaseSoftware] = useState<any[]>([]);
  const [experiencesLoading, setExperiencesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [personalInfoLoading, setPersonalInfoLoading] = useState(false);
  const [existingResume, setExistingResume] = useState<any | null>(null);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [interviewStatuses, setInterviewStatuses] = useState<Record<string, boolean>>({});
  const [hasCompletedWorkStyleInterview, setHasCompletedWorkStyleInterview] = useState(false);
  const [isCombinedInterview, setIsCombinedInterview] = useState(false);
  const [combinedInterviewCompleted, setCombinedInterviewCompleted] = useState(false);
  const [showEVIInterviewDialog, setShowEVIInterviewDialog] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<any>(null);
  
  // Request deduplication to prevent excessive API calls
  const [lastFetchTimes, setLastFetchTimes] = useState<{[key: string]: number}>({});
  const FETCH_COOLDOWN = 2000; // 2 seconds cooldown between identical requests

  // Debug logging for existingResume state changes
  useEffect(() => {
    console.log('🔍 existingResume state changed:', {
      existingResume,
      user: user?.email,
      currentStep,
      timestamp: new Date().toISOString()
    });
  }, [existingResume, user?.email, currentStep]);
  const [loadingOnboardingData, setLoadingOnboardingData] = useState(true);
  // Manual navigation only - no auto-sync
  const [data, setData] = useState<OnboardingData>({
    personalInfo: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      phoneCountry: "+1",
      streetAddress: "",
      city: "",
      stateProvince: "",
      zipPostalCode: "",
      country: "United States",
      linkedinProfile: "",
      githubProfile: "",
      portfolioWebsite: "",
      behanceProfile: "",
      dribbbleProfile: "",
      mediumProfile: "",
      twitterProfile: "",
      stackOverflowProfile: "",
    },
    workStyle: {
      careerGoals: "",
      workPreferences: [],
      industries: [],
    },
    skills: [],
    verificationComplete: false,
  });

  // Determine current step based on database progress
  const determineCurrentStep = (onboardingStatus: any): number => {
    console.log('🔍 determineCurrentStep input:', onboardingStatus);
    
    if (!onboardingStatus) {
      console.log('❌ No onboarding status, defaulting to step 1');
      return 1; // Start at resume upload if no status
    }

    const { 
      completionPercentage = 0, 
      currentStep: dbStep, 
      resumeUploaded = false, 
      resumeParsed = false,
      experienceCompleted = false, 
      profileCompleted = false,
      basicInfoCompleted = false
    } = onboardingStatus;

    console.log('📊 Onboarding status details:', {
      completionPercentage,
      dbStep,
      resumeUploaded,
      resumeParsed,
      experienceCompleted,
      profileCompleted,
      basicInfoCompleted
    });

    // Use completion percentage as primary indicator
    let determinedStep = 1;
    
    if (completionPercentage >= 80 || profileCompleted) {
      determinedStep = 5; // Completion/Review step
    } else if (completionPercentage >= 60 || experienceCompleted) {
      determinedStep = 4; // Work style interview step  
    } else if ((completionPercentage >= 40 && basicInfoCompleted) || experienceCompleted) {
      determinedStep = 3; // Experience enhancement step - FIXED: Requires Step 2 completion
    } else if (completionPercentage >= 20 || resumeUploaded || resumeParsed) {
      determinedStep = 2; // Personal information step
    } else {
      determinedStep = 1; // Resume upload step
    }
    
    // Debug logging for navigation fixes
    console.log('🔍 Step Determination Debug:', {
      completionPercentage,
      resumeUploaded,
      resumeParsed,
      basicInfoCompleted,
      experienceCompleted,
      profileCompleted,
      determinedStep,
      reasoning: determinedStep === 5 ? 'completionPercentage >= 80 || profileCompleted' :
                determinedStep === 4 ? 'completionPercentage >= 60 || experienceCompleted' :
                determinedStep === 3 ? '(completionPercentage >= 40 && basicInfoCompleted) || experienceCompleted' :
                determinedStep === 2 ? 'completionPercentage >= 20 || resumeUploaded || resumeParsed' :
                'default to step 1'
    });
    
    console.log('🎯 Determined step:', determinedStep);
    return determinedStep;
  };

  const handleNext = async () => {
    // Save personal info when navigating from step 2 (Personal Information)
    if (currentStep === 2 && currentUserId) {
      setIsLoading(true);
      try {
        await savePersonalInfo(currentUserId);
        toast({
          title: "Personal information saved!",
          description: "Your profile has been updated successfully.",
        });
      } catch (error) {
        toast({
          title: "Save failed",
          description: "Failed to save personal information. Please try again.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Complete onboarding and go to profile page
      const userId = currentUserId || user?.id;
      if (!userId) {
        toast({
          title: "Error",
          description: "User ID not found. Please try logging in again.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Onboarding Complete!",
        description: "Welcome to Job Twin. Your voice-enhanced profile is ready.",
      });
      navigate(`/profile/${userId}`);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      handleStepChange(currentStep - 1);
    }
  };

  // Helper function to check if mandatory steps are completed
  const hasCompletedMandatorySteps = () => {
    // Check Step 1: Resume must be uploaded
    const hasResume = !!data.resume || !!existingResume;
    
    // Check Step 2: Personal information must be filled
    const hasPersonalInfo = data.personalInfo.firstName && 
                           data.personalInfo.lastName && 
                           (data.personalInfo.email || user?.email);
    
    return hasResume && hasPersonalInfo;
  };

  const handleStepClick = (step: number) => {
    // Always allow going back to any previous step
    if (step <= currentStep) {
      handleStepChange(step);
      return;
    }
    
    // For forward navigation, check mandatory steps
    if (step > currentStep) {
      // If trying to go to steps 3, 4, or 5
      if (step >= 3 && step <= 5) {
        // Check if mandatory steps (1 and 2) are completed
        if (!hasCompletedMandatorySteps()) {
          // Provide specific feedback about what's missing
          if (!data.resume && !existingResume) {
            toast({
              title: "Resume Required",
              description: "Please upload your resume first to continue.",
              variant: "destructive"
            });
            return;
          }
          
          if (!data.personalInfo.firstName || !data.personalInfo.lastName) {
            toast({
              title: "Personal Information Required",
              description: "Please complete your personal information (First Name and Last Name) to continue.",
              variant: "destructive"
            });
            return;
          }
        }
        
        // If mandatory steps are completed, allow navigation
        handleStepChange(step);
      } else if (step === 2) {
        // Allow going from step 1 to step 2 if resume is uploaded
        if (data.resume || existingResume) {
          handleStepChange(step);
        } else {
          toast({
            title: "Resume Required",
            description: "Please upload your resume first.",
            variant: "destructive"
          });
        }
      }
    }
  };

  const handleStepChange = (step: number) => {
    console.log('🔄 handleStepChange called:', {
      fromStep: currentStep,
      toStep: step,
      user: user?.email,
      existingResume: !!existingResume,
      dataResume: !!data.resume,
      timestamp: new Date().toISOString()
    });
    
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        // Can proceed if has new resume OR existing resume
        const canProceedStep1 = !!data.resume || !!existingResume;
        console.log('🔍 Step 1 canProceed check:', {
          hasDataResume: !!data.resume,
          hasExistingResume: !!existingResume,
          existingResume,
          dataResume: data.resume,
          canProceed: canProceedStep1,
          userEmail: user?.email,
          userId: user?.id,
          isLoading: isLoading,
          resumeUploading: resumeUploading,
          buttonShouldBeEnabled: canProceedStep1 && !isLoading && !resumeUploading
        });
        return canProceedStep1;
      case 2:
        // Email is always available from user auth, so focus on name fields
        const hasEmail = data.personalInfo.email || user?.email;
        return data.personalInfo.firstName && data.personalInfo.lastName && hasEmail;
      case 3:
        return true; // Optional step
      case 4:
        return true; // AI interview is optional
      case 5:
        return true; // Skills Intelligence is optional
      default:
        return true;
    }
  };

  const updatePersonalInfo = (field: keyof OnboardingData['personalInfo'], value: string) => {
    setData(prev => ({
      ...prev,
      personalInfo: {
        ...prev.personalInfo,
        [field]: value,
      },
    }));
  };

  const updateWorkStyle = (field: keyof OnboardingData['workStyle'], value: any) => {
    setData(prev => ({
      ...prev,
      workStyle: {
        ...prev.workStyle,
        [field]: value,
      },
    }));
  };

  const addSkill = (skill: string) => {
    if (skill && !data.skills.includes(skill)) {
      setData(prev => ({
        ...prev,
        skills: [...prev.skills, skill],
      }));
    }
  };

  const removeSkill = (skill: string) => {
    setData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill),
    }));
  };

  // Fetch database skills and software
  const fetchDatabaseSkills = async (userId: string) => {
    const fetchKey = `fetchDatabaseSkills-${userId}`;
    const now = Date.now();
    
    // Check if we recently made this request
    if (lastFetchTimes[fetchKey] && (now - lastFetchTimes[fetchKey]) < FETCH_COOLDOWN) {
      console.log('🚫 Skipping fetchDatabaseSkills - too recent:', now - lastFetchTimes[fetchKey], 'ms ago');
      return;
    }
    
    setLastFetchTimes(prev => ({ ...prev, [fetchKey]: now }));
    setSkillsetsLoading(true);
    try {
      const [skillsetsRes, softwareRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/skillsets?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${import.meta.env.VITE_API_URL}/software?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);
      
      const skillsetsData = await skillsetsRes.json();
      const softwareData = await softwareRes.json();
      
      setDatabaseSkillsets(skillsetsData.skillsets || []);
      setDatabaseSoftware(softwareData.software || []);
    } catch (error) {
      console.error('Error fetching database skills:', error);
    } finally {
      setSkillsetsLoading(false);
    }
  };

  // Fetch experiences from database
  const fetchExperiences = async (userId: string) => {
    const fetchKey = `fetchExperiences-${userId}`;
    const now = Date.now();
    
    // Check if we recently made this request
    if (lastFetchTimes[fetchKey] && (now - lastFetchTimes[fetchKey]) < FETCH_COOLDOWN) {
      console.log('🚫 Skipping fetchExperiences - too recent:', now - lastFetchTimes[fetchKey], 'ms ago');
      return;
    }
    
    setLastFetchTimes(prev => ({ ...prev, [fetchKey]: now }));
    console.log('🎯 FETCH EXPERIENCES CALLED - Entry point');
    console.log('🎯 userId provided:', userId);
    console.log('🎯 Current parsedExperiences state:', parsedExperiences);
    
    setExperiencesLoading(true);
    try {
      console.log('🔄 Starting API request for userId:', userId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/experiences/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 Raw response:', response);
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', response.headers);
      
      const data = await response.json();
      console.log('📦 FULL Response data structure:', JSON.stringify(data, null, 2));
      console.log('📦 data.experiences:', data.experiences);
      console.log('📦 data.experiences type:', typeof data.experiences);
      console.log('📦 data.experiences length:', data.experiences?.length);
      
      if (response.ok && data.experiences) {
        console.log('🎯 BEFORE setState - About to set:', data.experiences);
        console.log('🎯 BEFORE setState - Current state:', parsedExperiences);
        
        setParsedExperiences(data.experiences);
        
        console.log('🎯 AFTER setState call completed');
        
        // Check state after timeout
        setTimeout(() => {
          console.log('🎯 State after 100ms timeout:', parsedExperiences);
        }, 100);
        
        setTimeout(() => {
          console.log('🎯 State after 500ms timeout:', parsedExperiences);
        }, 500);
        
        console.log('✅ setParsedExperiences called with:', data.experiences.length, 'items');
        console.log('✅ First experience:', data.experiences[0]);
      } else {
        console.error('❌ Failed to fetch experiences:', response.status, data);
        console.log('🎯 Setting empty array due to error');
        setParsedExperiences([]);
      }
    } catch (error) {
      console.error('❌ CATCH BLOCK - fetchExperiences error:', error);
      console.log('🎯 Setting empty array due to catch');
      setParsedExperiences([]);
    } finally {
      setExperiencesLoading(false);
      console.log('🎯 FETCH EXPERIENCES COMPLETED - Loading set to false');
    }
  };

  // Fetch interview completion statuses for experiences
  const fetchInterviewStatuses = async (userId: string) => {
    try {
      console.log('🎯 Fetching interview statuses for userId:', userId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/experiences/${userId}/interview-status`, {
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Interview statuses fetched:', data);
        
        // Convert array to object for easy lookup
        const statusMap: Record<string, boolean> = {};
        data.experiences?.forEach((exp: any) => {
          if (exp.experienceId) {
            statusMap[exp.experienceId] = exp.hasCompletedInterview || false;
          }
        });
        
        setInterviewStatuses(statusMap);
      } else {
        console.error('❌ Failed to fetch interview statuses:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching interview statuses:', error);
    }
  };

  // Fetch work style interview completion status
  const fetchWorkStyleInterviewStatus = async (userId: string) => {
    try {
      console.log('🎯 Fetching work style interview status for userId:', userId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/experiences/${userId}/work-style-interview-status`, {
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Work style interview status fetched:', data);
        setHasCompletedWorkStyleInterview(data.hasCompletedWorkStyleInterview);
      }
    } catch (error) {
      console.error('❌ Error fetching work style interview status:', error);
    }
  };

  // Load personal info from database
  const loadPersonalInfo = async (userId: string) => {
    const fetchKey = `loadPersonalInfo-${userId}`;
    const now = Date.now();
    
    // Check if we recently made this request
    if (lastFetchTimes[fetchKey] && (now - lastFetchTimes[fetchKey]) < FETCH_COOLDOWN) {
      console.log('🚫 Skipping loadPersonalInfo - too recent:', now - lastFetchTimes[fetchKey], 'ms ago');
      return;
    }
    
    setLastFetchTimes(prev => ({ ...prev, [fetchKey]: now }));
    setPersonalInfoLoading(true);
    try {
      console.log('🔄 Loading personal info for userId:', userId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const user = data.user;
        console.log('📦 Personal info API response:', user);
        
        // Detect phone country code if phone number exists
        let detectedCountry = "+1"; // Default
        if (user.phone) {
          detectedCountry = detectCountryFromPhone(user.phone);
        }
        
        setData(prev => ({
          ...prev,
          personalInfo: {
            ...prev.personalInfo,
            // Priority: User.saved > Resume.extracted > Empty > Current
            firstName: user.firstName || prev.personalInfo.firstName,
            lastName: user.lastName || prev.personalInfo.lastName,
            email: user.email || prev.personalInfo.email, // Will be made read-only
            phone: user.phone || prev.personalInfo.phone,
            phoneCountry: detectedCountry,
            streetAddress: user.address || prev.personalInfo.streetAddress,
            city: user.city || prev.personalInfo.city,
            stateProvince: user.state || prev.personalInfo.stateProvince,
            zipPostalCode: user.zipCode || prev.personalInfo.zipPostalCode,
            country: mapCountryCode(user.country) || prev.personalInfo.country,
            linkedinProfile: user.linkedinUrl || prev.personalInfo.linkedinProfile,
            // Keep existing online presence data (not extracted from resume)
            githubProfile: user.githubUrl || prev.personalInfo.githubProfile,
            portfolioWebsite: user.portfolioUrl || prev.personalInfo.portfolioWebsite,
            behanceProfile: user.behanceUrl || prev.personalInfo.behanceProfile,
            dribbbleProfile: user.dribbbleUrl || prev.personalInfo.dribbbleProfile,
            mediumProfile: user.mediumUrl || prev.personalInfo.mediumProfile,
            twitterProfile: user.twitterUrl || prev.personalInfo.twitterProfile,
            stackOverflowProfile: user.stackOverflowUrl || prev.personalInfo.stackOverflowProfile,
          }
        }));
        console.log('✅ Personal info loaded with priority: User saved > Resume extracted > Empty');
      } else {
        console.log('ℹ️ No personal info found in database, keeping form data');
      }
    } catch (error) {
      console.error('❌ Error loading personal info:', error);
    } finally {
      setPersonalInfoLoading(false);
    }
  };

  // Save personal info to database
  const savePersonalInfo = async (userId: string) => {
    try {
      console.log('💾 Saving personal info for userId:', userId, data.personalInfo);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/users/${userId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(data.personalInfo)
      });
      
      if (response.ok) {
        console.log('✅ Personal info saved to database');
        return true;
      } else {
        console.error('❌ Failed to save personal info');
        return false;
      }
    } catch (error) {
      console.error('❌ Error saving personal info:', error);
      return false;
    }
  };

  // Handle resume upload with API integration
  const handleResumeUpload = async (file: File) => {
    setResumeUploading(true);
    try {
      console.log('🚀 Starting resume upload...');
      const response = await resumeApi.uploadResume(file);
      console.log('✅ Resume upload response:', response);
      
      // Store parsed skills (experiences will be loaded from database)
      const skills = response.resume?.parsedContent?.skills || [];
      setParsedSkills(skills);
      
      // Update local data with uploaded resume and parsed data
      setData(prev => ({
        ...prev, 
        resume: file,
        // Pre-populate personal info from parsed resume data
        personalInfo: {
          ...prev.personalInfo,
          firstName: response.resume?.extractedName?.split(' ')[0] || prev.personalInfo.firstName,
          lastName: response.resume?.extractedName?.split(' ').slice(1).join(' ') || prev.personalInfo.lastName,
          email: response.resume?.extractedEmail || prev.personalInfo.email,
          phone: response.resume?.extractedPhone || prev.personalInfo.phone,
          streetAddress: response.resume?.extractedAddress || prev.personalInfo.streetAddress,
          city: response.resume?.extractedCity || prev.personalInfo.city,
          stateProvince: response.resume?.extractedState || prev.personalInfo.stateProvince,
          country: mapCountryCode(response.resume?.extractedCountry) || prev.personalInfo.country,
          zipPostalCode: response.resume?.extractedZipCode || prev.personalInfo.zipPostalCode,
          linkedinProfile: response.resume?.extractedLinkedIn || prev.personalInfo.linkedinProfile,
        }
      }));
      
      // Show success message with parsed data info
      toast({
        title: "Resume uploaded successfully!",
        description: `Extracted: ${response.resume?.extractedName || 'Name'}, ${response.resume?.extractedEmail || 'Email'}, and more!`,
      });
      
      // Show processing message
      toast({
        title: "Processing your resume...",
        description: "Extracting experiences and skills. This may take a moment.",
      });
      
      // CRITICAL: Clear stale data immediately after upload
      if (user?.id) {
        console.log('🧹 Clearing stale data before refetch...');
        setParsedExperiences([]);
        setDatabaseSkillsets([]);
        setDatabaseSoftware([]);
        setParsedSkills([]);
        setExperiencesLoading(true);
        
        // Add delay to ensure backend has finished saving to database
        console.log('⏳ Waiting 500ms for backend to save data to database...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          console.log('🔍 Force fetching latest database content...');
          
          // Fetch all data in parallel for speed
          const [skillsResponse, experiencesResponse] = await Promise.all([
            fetchDatabaseSkills(user.id),
            fetchExperiences(user.id)
          ]);
          
          // Load personal info separately to avoid blocking
          await loadPersonalInfo(user.id);
          
          console.log('✅ Latest database content fetched successfully');
          console.log('📊 New experiences count:', parsedExperiences.length);
          console.log('📊 New skillsets count:', databaseSkillsets.length);
          console.log('📊 New software count:', databaseSoftware.length);
          
        } catch (fetchError) {
          console.error('❌ Failed to fetch latest database content:', fetchError);
          toast({
            title: "Warning",
            description: "Resume uploaded but couldn't refresh data. Please refresh the page.",
            variant: "destructive"
          });
        } finally {
          setExperiencesLoading(false);
        }
      }
      
      // Auto-advance to next step after ensuring data is loaded
      setTimeout(async () => {
        // Get fresh onboarding status to determine correct step
        try {
          const freshData = await onboardingApi.getUserOnboardingData();
          const correctStep = determineCurrentStep(freshData.onboardingStatus);
          console.log('🎯 Auto-advancing to step:', correctStep);
          setCurrentStep(correctStep);
        } catch (error) {
          console.warn('Failed to get fresh onboarding status, defaulting to step 2');
          setCurrentStep(2);
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        toast({
          title: "Resume processed successfully!",
          description: "Your information has been extracted and saved.",
        });
      }, 6000); // Total 6 seconds before moving to next step
      
    } catch (error: any) {
      console.error('❌ Resume upload error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        stack: error.stack
      });
      
      // Extract user-friendly error message
      let errorMessage = "Failed to upload resume. Please try again.";
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.status === 413) {
        errorMessage = "File too large. Please upload a resume under 10MB.";
      } else if (error.response?.status === 429) {
        errorMessage = "Too many requests. Please wait a moment and try again.";
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data.error || "Invalid file format. Please upload a PDF or Word document.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setResumeUploading(false);
    }
  };

  // Load user's existing data on component mount
  useEffect(() => {
    const loadOnboardingData = async () => {
      if (!user?.id) {
        setLoadingOnboardingData(false);
        return;
      }

      setLoadingOnboardingData(true);
      setCurrentUserId(user.id); // Set current user ID for personal info save
      console.log('🔍 Loading existing onboarding data for user:', user.id);

      try {
        // Fetch all onboarding data
        console.log('🔍 Fetching onboarding data for user:', user?.email, user?.id);
        const onboardingData = await onboardingApi.getUserOnboardingData();
        console.log('📦 Onboarding data loaded for', user?.email, ':', onboardingData);

        // Determine current step from onboarding status first
        console.log('📊 Raw onboarding data:', onboardingData);
        console.log('📊 Onboarding status:', onboardingData.onboardingStatus);
        const determinedStep = determineCurrentStep(onboardingData.onboardingStatus);
        console.log('🎯 Determined step from database:', determinedStep);
        console.log('🎯 Setting currentStep to:', determinedStep);
        setCurrentStep(determinedStep);

        // Check if user has existing resume
        if (onboardingData.resume) {
          console.log('✅ Found existing resume:', onboardingData.resume);
          console.log('🔍 SETTING existingResume for user:', user?.email, user?.id);
          setExistingResume(onboardingData.resume);
          setHasExistingData(true);
          
          // Load parsed data from existing resume
          if (onboardingData.resume.parsedData) {
            const parsedData = onboardingData.resume.parsedData;
            
            // Set personal info from resume
            if (parsedData.personalInfo) {
              setData(prev => ({
                ...prev,
                personalInfo: {
                  ...prev.personalInfo,
                  ...parsedData.personalInfo,
                }
              }));
            }
            
            // Set parsed experiences
            if (parsedData.experiences) {
              setParsedExperiences(parsedData.experiences);
            }
            
            // Set parsed skills
            if (parsedData.skills) {
              setParsedSkills(parsedData.skills);
            }
          }
        } else {
          console.log('❌ No existing resume found for user:', user?.email, user?.id);
        }

        // Use experiences from onboarding data first, then fetch fresh if needed
        if (onboardingData.experiences && onboardingData.experiences.length > 0) {
          console.log('✅ Setting experiences from onboarding data:', onboardingData.experiences);
          setParsedExperiences(onboardingData.experiences);
        }

        // Load other data in parallel
        await Promise.all([
          onboardingData.experiences?.length > 0 ? Promise.resolve() : fetchExperiences(user.id),
          fetchDatabaseSkills(user.id),
          loadPersonalInfo(user.id)
        ]);

      } catch (error) {
        console.error('❌ Failed to load onboarding data for', user?.email, ':', error);
        setHasError(false); // Keep component working even if API fails
      } finally {
        console.log('🏁 loadOnboardingData completed for:', user?.email);
        setLoadingOnboardingData(false);
      }
    };

    loadOnboardingData();
  }, [user?.id]);

  // Manual navigation only - no auto-sync removed
  
  // Load personal data when reaching step 2 and fetch experiences when reaching step 3
  useEffect(() => {
    if (!user?.id) return;
    
    if (currentStep === 1) {
      // When navigating back to Step 1, ensure data.resume is set if we have existingResume
      if (existingResume && !data.resume) {
        console.log('🔧 Step 1: Setting data.resume from existingResume for user:', user?.email);
        setData(prev => ({ ...prev, resume: existingResume }));
      }
    } else if (currentStep === 2) {
      console.log('📍 Step 2 reached, loading personal info for user:', user.id);
      loadPersonalInfo(user.id);
    } else if (currentStep === 3) {
      console.log('📍 Step 3 reached, fetching experiences for user:', user.id);
      // Always fetch fresh data when entering step 3
      fetchExperiences(user.id);
      fetchDatabaseSkills(user.id);
      fetchInterviewStatuses(user.id);
    } else if (currentStep === 4) {
      console.log('📍 Step 4 reached, fetching work style interview status for user:', user.id);
      // Fetch work style interview status
      fetchWorkStyleInterviewStatus(user.id);
    }
  }, [currentStep, user?.id, existingResume]);

  // Get combined database skills using Text Kernel's built-in categorization
  const getDatabaseSkills = () => {
    const combined = [];
    
    // Add skillsets with type 'skill'
    databaseSkillsets.forEach(skillset => {
      combined.push({
        name: skillset.name || 'Unknown Skill',
        category: skillset.category?.toLowerCase()?.replace('_', ' ') || 'other',
        type: 'skill',
        years: skillset.yearsOfExp || 0,
        lastUsed: skillset.lastUsed ? new Date(skillset.lastUsed).getFullYear().toString() : 'N/A',
        source: skillset.source
      });
    });
    
    // Add software with type 'software'
    databaseSoftware.forEach(software => {
      combined.push({
        name: software.name,
        category: 'software',
        type: 'software', 
        years: software.yearsOfExp || 0,
        lastUsed: software.lastUsed ? new Date(software.lastUsed).getFullYear().toString() : 'N/A',
        source: software.source
      });
    });
    
    return combined;
  };

  // Use database skills if available, otherwise fall back to parsed skills with Text Kernel categories
  const getDisplaySkills = () => {
    if (databaseSkillsets.length > 0 || databaseSoftware.length > 0) {
      return getDatabaseSkills();
    }
    
    // Fallback: use Text Kernel's built-in categorization from parsed skills
    return parsedSkills.map(skill => ({
      name: skill?.name || skill || 'Unknown Skill',
      category: skill?.category === 'IT' ? 'software' : (skill?.category?.toLowerCase() || 'other'),
      type: skill?.category === 'IT' ? 'software' : 'skill',
      years: Math.floor((skill?.monthsExperience || 0) / 12) || 0,
      lastUsed: skill?.lastUsed?.slice(0, 4) || 'N/A',
      source: 'resume_parsed'
    }));
  };

  const categorizedSkills = getDisplaySkills();

  const handleSort = (column: 'years' | 'lastUsed') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedSkills = () => {
    if (!sortColumn) return categorizedSkills;

    return [...categorizedSkills].sort((a, b) => {
      if (sortColumn === 'years') {
        const comparison = a.years - b.years;
        return sortDirection === 'asc' ? comparison : -comparison;
      } else if (sortColumn === 'lastUsed') {
        // Handle "Current" as the most recent
        const aValue = a.lastUsed === 'Current' ? '2025' : a.lastUsed;
        const bValue = b.lastUsed === 'Current' ? '2025' : b.lastUsed;
        const comparison = parseInt(aValue) - parseInt(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  };

  const getSortIcon = (column: 'years' | 'lastUsed') => {
    if (sortColumn !== column) {
      return <ChevronUp className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
                <Upload className="w-6 h-6" />
                Resume Upload & AI Parsing
              </h2>
              <p className="text-muted-foreground">
                Upload your resume for AI-powered analysis and enhancement
              </p>
            </div>
            
            {/* Show existing resume status */}
            {existingResume && !data.resume && (
              <Card className="p-6 bg-green-50 border-green-200">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-green-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900 mb-1">Resume Already Uploaded</h3>
                    <p className="text-sm text-green-700 mb-3">
                      You've already uploaded a resume on {new Date(existingResume.createdAt).toLocaleDateString()}.
                      You can continue with the existing data or upload a new resume.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <FileText className="w-4 h-4" />
                      <span>{existingResume.fileName || 'Resume'}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            
            {/* Show upload component */}
            <div>
              {existingResume && !data.resume ? (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Want to upload a different resume? This will replace your existing data.
                  </p>
                </div>
              ) : null}
              
              <FileUpload
                onFileSelect={handleResumeUpload}
                isUploading={resumeUploading}
              />
            </div>
            
            {/* Skip button if existing resume */}
            {existingResume && !data.resume && (
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setData(prev => ({ ...prev, resume: existingResume }));
                    handleNext();
                  }}
                  className="mt-2"
                >
                  Continue with Existing Resume
                </Button>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Personal Information</h2>
              <p className="text-muted-foreground">
                Complete your profile with detailed information
              </p>
            </div>
            
            <Card className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={data.personalInfo.firstName}
                      onChange={(e) => updatePersonalInfo('firstName', e.target.value)}
                      placeholder="Enter your first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={data.personalInfo.lastName}
                      onChange={(e) => updatePersonalInfo('lastName', e.target.value)}
                      placeholder="Enter your last name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || data.personalInfo.email || ''}
                      readOnly
                      disabled
                      placeholder="Your signup email address"
                      className="bg-gray-50 cursor-not-allowed opacity-75"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Address */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Address</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={data.personalInfo.city}
                        onChange={(e) => updatePersonalInfo('city', e.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stateProvince">State/Province</Label>
                      <Input
                        id="stateProvince"
                        value={data.personalInfo.stateProvince}
                        onChange={(e) => updatePersonalInfo('stateProvince', e.target.value)}
                        placeholder="State/Province"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zipPostalCode">ZIP/Postal Code</Label>
                      <Input
                        id="zipPostalCode"
                        value={data.personalInfo.zipPostalCode}
                        onChange={(e) => updatePersonalInfo('zipPostalCode', e.target.value)}
                        placeholder="ZIP/Postal Code"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={data.personalInfo.country}
                      onValueChange={(value) => updatePersonalInfo('country', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="United States">United States</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                        <SelectItem value="Australia">Australia</SelectItem>
                        <SelectItem value="Germany">Germany</SelectItem>
                        <SelectItem value="France">France</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Phone Number */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Phone Number</h3>
                <div className="flex gap-2">
                  <div className="w-24">
                    <Select
                      value={data.personalInfo.phoneCountry}
                      onValueChange={(value) => updatePersonalInfo('phoneCountry', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                        <SelectItem value="+44">🇬🇧 +44</SelectItem>
                        <SelectItem value="+49">🇩🇪 +49</SelectItem>
                        <SelectItem value="+33">🇫🇷 +33</SelectItem>
                        <SelectItem value="+61">🇦🇺 +61</SelectItem>
                        <SelectItem value="+1">🇨🇦 +1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Input
                      value={data.personalInfo.phone}
                      onChange={(e) => updatePersonalInfo('phone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Online Presence */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Online Presence</h3>
                  <p className="text-sm text-muted-foreground">Add your professional LinkedIn profile</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="linkedinProfile">LinkedIn Profile</Label>
                  <Input
                    id="linkedinProfile"
                    value={data.personalInfo.linkedinProfile}
                    onChange={(e) => updatePersonalInfo('linkedinProfile', e.target.value)}
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>
              </div>

              <Separator />

              {/* Profile Photo */}
              <div className="space-y-4">
                <ProfilePhotoUpload
                  onPhotoSelect={(file) => setData(prev => ({ ...prev, profilePhoto: file }))}
                  currentPhoto={data.profilePhoto}
                />
              </div>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Experience Enhancement</h2>
              <p className="text-muted-foreground">
                Experience the future of resume processing with AI-powered skills extraction, contextual job analysis, and intelligent career insights.
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  <h3 className="text-lg font-semibold">Experience Enhancement</h3>
                </div>
              </div>
              
              {/* Manual refresh button for debugging */}
              <div className="flex justify-between items-center">
                <Button
                  onClick={async () => {
                    if (user?.id) {
                      console.log('🔄 Manual refresh triggered for user:', user.id);
                      setExperiencesLoading(true);
                      // Clear cache and force fresh fetch
                      setParsedExperiences([]);
                      await new Promise(resolve => setTimeout(resolve, 500));
                      await fetchExperiences(user.id);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  disabled={experiencesLoading}
                >
                  {experiencesLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    'Refresh Experiences'
                  )}
                </Button>
                <Button
                  onClick={() => {
                    // Use the existing combined interview dialog
                    setShowEVIInterviewDialog(true);
                    setIsCombinedInterview(true);
                    // Create a combined job object with all experiences
                    const combinedJob = {
                      title: 'Combined Interview',
                      company: 'All Experiences',
                      duration: '',
                      location: '',
                      description: 'Interview covering all work experiences',
                      skills: [],
                      software: [],
                      aiSuggestedSkills: [],
                      aiSuggestedSoftware: [],
                      allExperiences: parsedExperiences
                    };
                    setSelectedExperience(combinedJob);
                  }}
                  className="bg-gradient-primary hover:opacity-90"
                  size="sm"
                  disabled={!parsedExperiences || parsedExperiences.length === 0}
                >
                  {combinedInterviewCompleted ? 'Take Interview Again' : 'Start Real-Time Interview'}
                </Button>
              </div>

              {/* Debug info */}
              {console.log('🔍 Debug - Experiences state:', {
                experiencesLoading,
                parsedExperiencesLength: parsedExperiences.length,
                parsedExperiences,
                userId: user?.id
              })}
              
              {/* Experience Cards */}
              <div className="space-y-4">

                {experiencesLoading ? (
                  <div className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-muted-foreground">
                        {data.resume ? 'Updating your experiences...' : 'Loading your work experiences...'}
                      </span>
                    </div>
                  </div>
                ) : parsedExperiences.length > 0 ? (
                  parsedExperiences.map((experience, index) => {
                    console.log('🔍 Rendering experience:', experience);
                    
                    // Auto-populate skills and software from parsed data that match this job
                    const safeSkills = Array.isArray(categorizedSkills) ? categorizedSkills : [];
                    const jobSkills = safeSkills.filter(skill => 
                      skill && skill.name && (
                        (experience?.description?.toLowerCase()?.includes(skill.name.toLowerCase()) || false) ||
                        (experience?.jobTitle?.toLowerCase()?.includes(skill.name.toLowerCase()) || false)
                      )
                    );
                    
                    // Separate skills and software
                    const skills = jobSkills.filter(skill => skill.type === 'skill').map(skill => skill.name);
                    const software = jobSkills.filter(skill => skill.type === 'software').map(skill => skill.name);
                    
                    // AI suggested skills are those from the parsed data not yet assigned to this job
                    const aiSuggestedSkills = safeSkills
                      .filter(skill => skill && skill.type === 'skill' && skill.name && !skills.includes(skill.name))
                      .slice(0, 5)
                      .map(skill => skill.name);
                    
                    const aiSuggestedSoftware = safeSkills
                      .filter(skill => skill && skill.type === 'software' && skill.name && !software.includes(skill.name))
                      .slice(0, 5)
                      .map(skill => skill.name);

                    // Transform API data to match ExperienceCard interface
                    const jobData = {
                      title: experience.jobTitle || 'Untitled Position',
                      company: experience.company || 'Unknown Company',
                      duration: experience.startDate && experience.endDate ? 
                        `${new Date(experience.startDate).getFullYear()} - ${
                          experience.isCurrentRole ? 'Present' : new Date(experience.endDate).getFullYear()
                        }` : 'Duration not specified',
                      location: experience.location || 'N/A',
                      description: experience.description || 'No description available',
                      skills: skills || [],
                      software: software || [],
                      aiSuggestedSkills: aiSuggestedSkills || [],
                      aiSuggestedSoftware: aiSuggestedSoftware || []
                    };

                    console.log('🔧 Transformed job data:', jobData);

                    return (
                      <ExperienceCard
                        key={experience.id || index}
                        job={jobData}
                        experienceId={experience.id}
                        isExpanded={expandedCard === index}
                        onToggle={() => setExpandedCard(expandedCard === index ? null : index)}
                        hasCompletedInterview={interviewStatuses[experience.id] || false}
                        onJobUpdate={() => {
                          // Refresh interview statuses when interview is completed
                          if (user?.id) {
                            fetchInterviewStatuses(user.id);
                          }
                        }}
                      />
                    );
                  })
                ) : (
                  <Card className="p-8">
                    <div className="text-center space-y-4">
                      <div className="bg-muted/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                        <Briefcase className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold mb-2">No Work Experience Found</h3>
                        <p className="text-muted-foreground">
                          {data.resume ? 
                            "Your resume has been uploaded but no experiences were extracted. Please check if your resume contains work experience information." :
                            "Please upload your resume in Step 1 to extract and display your work experiences here."
                          }
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Once extracted, your experiences will be saved to the database for AI-powered interviews.
                        </p>
                      </div>
                      {!data.resume && (
                        <Button 
                          onClick={() => setCurrentStep(1)}
                          variant="outline"
                          className="mt-4"
                        >
                          Go to Resume Upload
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>

            {/* Combined Interview Dialog */}
            {showEVIInterviewDialog && (
              <EVIInterviewDialog
                isOpen={showEVIInterviewDialog}
                onClose={() => {
                  setShowEVIInterviewDialog(false);
                  setIsCombinedInterview(false);
                  setSelectedExperience(null);
                }}
                job={selectedExperience}
                onInterviewComplete={() => {
                  setCombinedInterviewCompleted(true);
                  // Don't close dialog - let user see the insights
                  // setShowEVIInterviewDialog(false); // Removed to show insights
                  setIsCombinedInterview(false);
                  setSelectedExperience(null);
                  // Refresh all interview statuses
                  if (user?.id && parsedExperiences.length > 0) {
                    fetchInterviewStatuses(user.id);
                  }
                }}
              />
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">
                Work Style & Career Goals
              </h2>
              <p className="text-muted-foreground">
                Experience the future of resume processing with AI-powered skills extraction, contextual job analysis, and intelligent career insights.
              </p>
            </div>

            <div className="flex justify-center">
              <Card className="p-8 max-w-md w-full text-center space-y-6">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Briefcase className="w-8 h-8 text-primary" />
                  </div>

                  <div className="space-y-2">
                    <div className="inline-block bg-muted px-3 py-1 rounded-full text-sm font-medium">
                      Work Style & Career Goals
                    </div>
                    <p className="text-muted-foreground">
                      This interview will focus on your work type and career objectives
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => setShowWorkStyleDialog(true)}
                  className={hasCompletedWorkStyleInterview
                    ? "w-full bg-transparent border border-emerald-500 text-emerald-700 hover:bg-emerald-50 transition-all duration-200 hover:scale-105"
                    : "w-full bg-gradient-primary hover:opacity-90"}
                  size="lg"
                >
                  {hasCompletedWorkStyleInterview ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Take Interview Again
                    </>
                  ) : (
                    'Start Interview'
                  )}
                </Button>
              </Card>
            </div>

            <WorkStyleInterviewDialog
              isOpen={showWorkStyleDialog}
              onClose={() => setShowWorkStyleDialog(false)}
              onInterviewComplete={() => {
                // Refresh work style interview status after completion
                if (user?.id) {
                  fetchWorkStyleInterviewStatus(user.id);
                }
              }}
            />
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Skills Intelligence & Context Analysis</h2>
              <p className="text-muted-foreground">
                AI-powered analysis of your skills and experience extracted from your resume
              </p>
            </div>
            
            <Card className="p-6">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="by-job">By Job</TabsTrigger>
                  <TabsTrigger value="by-industry">By Category</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary" className="mt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5" />
                      <h3 className="text-lg font-semibold">Skills & Software Summary</h3>
                    </div>
                    
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Skill/Software</TableHead>
                          <TableHead 
                            className="cursor-pointer select-none group hover:bg-muted/50 transition-colors"
                            onClick={() => handleSort('years')}
                          >
                            <div className="flex items-center gap-1">
                              Years Experience
                              {getSortIcon('years')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer select-none group hover:bg-muted/50 transition-colors"
                            onClick={() => handleSort('lastUsed')}
                          >
                            <div className="flex items-center gap-1">
                              Last Used
                              {getSortIcon('lastUsed')}
                            </div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skillsetsLoading ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8">
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-muted-foreground">Loading skills from database...</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : categorizedSkills.length > 0 ? (
                          getSortedSkills().slice(0, 25).map((skill, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="secondary" 
                                    className={
                                      skill.category === 'software' 
                                        ? "bg-green-50 text-green-700 border-green-200" 
                                        : skill.category === 'programming'
                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                        : skill.category === 'frameworks'
                                        ? "bg-purple-50 text-purple-700 border-purple-200"
                                        : skill.category === 'soft'
                                        ? "bg-orange-50 text-orange-700 border-orange-200"
                                        : skill.category === 'professional'
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        : "bg-gray-50 text-gray-700 border-gray-200"
                                    }
                                  >
                                    {skill.name}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {skill.category.replace('_', ' ')}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-medium">
                                  {skill.years > 0 ? `${skill.years}` : 'N/A'}
                                </span>
                              </TableCell>
                              <TableCell className={skill.lastUsed === 'Current' ? 'text-success font-medium' : ''}>
                                {skill.lastUsed}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                              Upload a resume to see your extracted skills here.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                
                <TabsContent value="by-job" className="mt-6">
                  <div className="space-y-4">
                    <p className="text-muted-foreground">Skills organized by your work experience</p>
                    {skillsetsLoading ? (
                      <div className="text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-muted-foreground">Loading skills from database...</span>
                        </div>
                      </div>
                    ) : parsedExperiences.length > 0 ? (
                      <div className="space-y-6">
                        {parsedExperiences.map((experience, index) => {
                          // Extract skills mentioned in job description
                          const jobSkills = categorizedSkills.filter(skill => 
                            (experience?.description?.toLowerCase()?.includes(skill?.name?.toLowerCase()) || false) ||
                            (experience?.jobTitle?.toLowerCase()?.includes(skill?.name?.toLowerCase()) || false)
                          );
                          
                          return (
                            <Card key={index} className="p-4">
                              <h4 className="font-semibold text-lg mb-2">
                                {experience.jobTitle} at {experience.company}
                              </h4>
                              <p className="text-sm text-muted-foreground mb-3">
                                {experience.startDate?.slice(0, 4)} - {experience.isCurrentRole ? 'Present' : experience.endDate?.slice(0, 4)}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {jobSkills.length > 0 ? (
                                  jobSkills.map((skill, skillIndex) => (
                                    <Badge 
                                      key={skillIndex}
                                      variant="outline" 
                                      className={
                                        skill.category === 'software' 
                                          ? "border-green-200 text-green-700" 
                                          : skill.category === 'programming'
                                          ? "border-blue-200 text-blue-700"
                                          : "border-gray-200 text-gray-700"
                                      }
                                    >
                                      {skill.name}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">No specific skills identified for this role</span>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Upload a resume to see skills organized by job position
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="by-industry" className="mt-6">
                  <div className="space-y-4">
                    <p className="text-muted-foreground">Skills and software categorized by type</p>
                    {skillsetsLoading ? (
                      <div className="text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-muted-foreground">Loading skills from database...</span>
                        </div>
                      </div>
                    ) : categorizedSkills.length > 0 ? (
                      <div className="space-y-6">
                        {['programming', 'software', 'frameworks', 'soft', 'professional', 'technical'].map(category => {
                          const categorySkills = categorizedSkills.filter(skill => skill.category === category);
                          if (categorySkills.length === 0) return null;
                          
                          return (
                            <Card key={category} className="p-4">
                              <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  category === 'software' ? 'bg-green-500' :
                                  category === 'programming' ? 'bg-blue-500' :
                                  category === 'frameworks' ? 'bg-purple-500' :
                                  category === 'soft' ? 'bg-orange-500' :
                                  category === 'professional' ? 'bg-indigo-500' :
                                  'bg-gray-500'
                                }`}></div>
                                {category === 'soft' ? 'Soft Skills' : 
                                 category === 'professional' ? 'Professional Skills' :
                                 category.charAt(0).toUpperCase() + category.slice(1)} 
                                <span className="text-sm text-muted-foreground font-normal">
                                  ({categorySkills.length})
                                </span>
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {categorySkills.map((skill, index) => (
                                  <Badge 
                                    key={index}
                                    variant="secondary" 
                                    className={
                                      category === 'software' 
                                        ? "bg-green-50 text-green-700 border-green-200" 
                                        : category === 'programming'
                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                        : category === 'frameworks'
                                        ? "bg-purple-50 text-purple-700 border-purple-200"
                                        : category === 'soft'
                                        ? "bg-orange-50 text-orange-700 border-orange-200"
                                        : category === 'professional'
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        : "bg-gray-50 text-gray-700 border-gray-200"
                                    }
                                  >
                                    {skill.name}
                                    {skill.years > 0 && (
                                      <span className="ml-1 text-xs opacity-70">
                                        ({skill.years}y)
                                      </span>
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Upload a resume to see skills organized by category
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading state while fetching onboarding data
  if (loadingOnboardingData) {
    return (
      <OnboardingLayout
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        title="Job Twin - Transform Your Resume with Voice"
        subtitle="AI-Powered Resume Enhancement"
        onStepClick={handleStepClick}
      >
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading your onboarding data...</p>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={TOTAL_STEPS}
      title="Job Twin - Transform Your Resume with Voice"
      subtitle="AI-Powered Resume Enhancement"
      onStepClick={handleStepClick}
    >
      {renderStepContent()}
      
      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 1}
        >
          Previous
        </Button>
        
        <Button
          onClick={handleNext}
          disabled={!canProceed() || isLoading || resumeUploading}
          className="bg-gradient-primary hover:opacity-90"
        >
          {isLoading || resumeUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            currentStep === TOTAL_STEPS ? "Complete Setup" : "Next"
          )}
        </Button>
      </div>
    </OnboardingLayout>
  );
}