import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useAuthStore } from '../store/authStore';
import {
  LoginForm,
  RegisterForm,
  ProfileForm,
  PasswordChangeForm,
  AuthResponse,
  Resume,
  ResumeAnalytics,
  Voice,
  VoiceProfile,
  InterviewSession,
  InterviewAnalytics,
  Conversation,
  ConversationAnalytics,
  SpeechGenerationRequest,
  SpeechGenerationResponse,
  SpeechStatusResponse,
  StartInterviewRequest,
  SubmitResponseRequest,
  StartConversationRequest,
  ProcessMessageRequest,
  PaginatedResponse,
} from '../types';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const authState = useAuthStore.getState();
    const token = authState.token;
    
    console.log('🔍 API Request interceptor:', {
      url: config.url,
      method: config.method,
      hasToken: !!token,
      isAuthenticated: authState.isAuthenticated,
      tokenLength: token ? token.length : 0
    });
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Handle FormData requests - remove default Content-Type to let browser set boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    console.log('🚨 API Response error:', {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      responseData: error.response?.data
    });
    
    // Only logout on 401 for authentication-related endpoints, not all 401s
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const shouldLogout = url.includes('/auth/') || url.includes('/login') || url.includes('/profile');
      
      console.log('🔓 Received 401 - should logout?', shouldLogout, 'for URL:', url);
      
      if (shouldLogout) {
        console.log('🔓 Logging out user due to auth-related 401');
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (credentials: LoginForm): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (userData: RegisterForm): Promise<AuthResponse> => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  getProfile: async (): Promise<{ user: any }> => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (profileData: ProfileForm): Promise<{ message: string; user: any }> => {
    const response = await api.put('/auth/profile', profileData);
    return response.data;
  },

  changePassword: async (passwordData: PasswordChangeForm): Promise<{ message: string }> => {
    const response = await api.post('/auth/change-password', passwordData);
    return response.data;
  },
};

// Resume API
export const resumeApi = {
  uploadResume: async (file: File): Promise<{ message: string; resume: Resume }> => {
    console.log('🔄 uploadResume called with file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    const formData = new FormData();
    formData.append('resume', file);
    
    console.log('📡 Making POST request to /resumes/upload');
    console.log('🌐 API baseURL:', api.defaults.baseURL);
    
    try {
      const response = await api.post('/resumes/upload', formData);
      console.log('✅ Upload response received:', response);
      return response.data;
    } catch (error) {
      console.error('❌ Upload request failed:', {
        message: error.message,
        code: error.code,
        config: error.config,
        request: error.request
      });
      throw error;
    }
  },

  getUserResumes: async (): Promise<{ resumes: Resume[] }> => {
    const response = await api.get('/resumes');
    return response.data;
  },

  getResume: async (resumeId: string): Promise<{ resume: Resume }> => {
    const response = await api.get(`/resumes/${resumeId}`);
    return response.data;
  },

  deleteResume: async (resumeId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/resumes/${resumeId}`);
    return response.data;
  },

  getAnalytics: async (): Promise<{ analytics: ResumeAnalytics }> => {
    const response = await api.get('/resumes/analytics/overview');
    return response.data;
  },
};

// Voice API
export const voiceApi = {
  getAvailableVoices: async (): Promise<{ voices: Voice[] }> => {
    const response = await api.get('/voice/available');
    return response.data;
  },

  createVoiceProfile: async (profileData: {
    humeVoiceId: string;
    voiceName: string;
    voiceSettings?: any;
  }): Promise<{ message: string; voiceProfile: VoiceProfile }> => {
    const response = await api.post('/voice/profiles', profileData);
    return response.data;
  },

  getUserVoiceProfiles: async (): Promise<{ voiceProfiles: VoiceProfile[] }> => {
    const response = await api.get('/voice/profiles');
    return response.data;
  },

  updateVoiceProfile: async (
    profileId: string,
    profileData: Partial<VoiceProfile>
  ): Promise<{ message: string; voiceProfile: VoiceProfile }> => {
    const response = await api.put(`/voice/profiles/${profileId}`, profileData);
    return response.data;
  },

  deleteVoiceProfile: async (profileId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/voice/profiles/${profileId}`);
    return response.data;
  },

  generateSpeech: async (request: SpeechGenerationRequest): Promise<SpeechGenerationResponse> => {
    const response = await api.post('/voice/generate', request);
    return response.data;
  },

  streamSpeech: async (request: SpeechGenerationRequest): Promise<{ message: string; jobId: string }> => {
    const response = await api.post('/voice/stream', request);
    return response.data;
  },

  getSpeechStatus: async (jobId: string): Promise<SpeechStatusResponse> => {
    const response = await api.get(`/voice/status/${jobId}`);
    return response.data;
  },
};

// Interview API
export const interviewApi = {
  startInterview: async (request: StartInterviewRequest): Promise<{
    message: string;
    session: InterviewSession;
  }> => {
    const response = await api.post('/interviews/start', request);
    return response.data;
  },

  getCurrentSession: async (): Promise<{ session: InterviewSession }> => {
    const response = await api.get('/interviews/current');
    return response.data;
  },

  submitResponse: async (request: SubmitResponseRequest): Promise<{
    message: string;
    response: any;
    isCompleted: boolean;
    nextQuestionIndex: number;
  }> => {
    const response = await api.post('/interviews/response', request);
    return response.data;
  },

  getHistory: async (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<InterviewSession>> => {
    const response = await api.get('/interviews/history', { params });
    return response.data;
  },

  getAnalytics: async (): Promise<{ analytics: InterviewAnalytics }> => {
    const response = await api.get('/interviews/analytics');
    return response.data;
  },
};

// Conversation API
export const conversationApi = {
  startConversation: async (request: StartConversationRequest): Promise<{
    message: string;
    conversation: Conversation;
  }> => {
    const response = await api.post('/conversations/start', request);
    return response.data;
  },

  getUserConversations: async (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<Conversation>> => {
    const response = await api.get('/conversations', { params });
    return response.data;
  },

  getConversation: async (conversationId: string): Promise<{ conversation: Conversation }> => {
    const response = await api.get(`/conversations/${conversationId}`);
    return response.data;
  },

  processMessage: async (conversationId: string, request: ProcessMessageRequest): Promise<{
    message: string;
    recruiterMessage: any;
    twinResponse: {
      text: string;
      audioUrl: string | null;
    };
  }> => {
    const response = await api.post(`/conversations/${conversationId}/message`, request);
    return response.data;
  },

  endConversation: async (conversationId: string): Promise<{ message: string }> => {
    const response = await api.put(`/conversations/${conversationId}/end`);
    return response.data;
  },

  getAnalytics: async (): Promise<{ analytics: ConversationAnalytics }> => {
    const response = await api.get('/conversations/analytics/overview');
    return response.data;
  },
};

// Experience API
export const experienceApi = {
  getUserExperiences: async (userId?: string): Promise<{ experiences: any[] }> => {
    const endpoint = userId ? `/experiences/${userId}` : '/experiences';
    const response = await api.get(endpoint);
    return response.data;
  },
  
  updateExperience: async (experienceId: string, data: any): Promise<{ experience: any }> => {
    const response = await api.put(`/experiences/${experienceId}`, data);
    return response.data;
  },
  
  deleteExperience: async (experienceId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/experiences/${experienceId}`);
    return response.data;
  },
};

// Skillsets API
export const skillsetsApi = {
  getUserSkillsets: async (userId: string): Promise<{ skillsets: any[] }> => {
    const response = await api.get(`/skillsets/${userId}`);
    return response.data;
  },
  
  createSkillset: async (data: any): Promise<{ skillset: any }> => {
    const response = await api.post('/skillsets', data);
    return response.data;
  },
};

// Onboarding API - Aggregates all user data for onboarding flow
export const onboardingApi = {
  getUserOnboardingData: async (): Promise<{
    resume: any | null;
    experiences: any[];
    skillsets: any[];
    personalInfo: any | null;
    workStyleInterview: any | null;
    onboardingStatus: any | null;
  }> => {
    try {
      // Fetch all data in parallel
      const [resumeData, experienceData, skillsetsData, onboardingStatusData] = await Promise.all([
        resumeApi.getUserResumes().catch(() => ({ resumes: [] })),
        experienceApi.getUserExperiences().catch(() => ({ experiences: [] })),
        api.get('/skillsets').catch(() => ({ data: { skillsets: [] } })),
        api.get('/users/onboarding-status').catch((error) => {
          console.error('❌ Failed to fetch onboarding status:', error);
          return { data: { status: null } };
        }),
      ]);
      
      // Get the most recent resume
      const latestResume = resumeData.resumes.length > 0 
        ? resumeData.resumes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        : null;
      
      return {
        resume: latestResume,
        experiences: experienceData.experiences,
        skillsets: skillsetsData.data.skillsets,
        personalInfo: latestResume?.parsedData?.personalInfo || null,
        workStyleInterview: null, // Will implement later
        onboardingStatus: onboardingStatusData.data || null,
      };
    } catch (error) {
      console.error('Error fetching onboarding data:', error);
      return {
        resume: null,
        experiences: [],
        skillsets: [],
        personalInfo: null,
        workStyleInterview: null,
        onboardingStatus: null,
      };
    }
  },
};

export default api;