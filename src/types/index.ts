// User types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profileCompleted: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

// Resume types
export interface Resume {
  id: string;
  originalFilename: string;
  fileUrl: string;
  parsedContent?: any;
  rawText?: string;
  skills?: string[];
  experienceYears?: number;
  jobTitles?: string[];
  createdAt: string;
}

export interface ResumeAnalytics {
  totalResumes: number;
  topSkills: Array<{ skill: string; count: number }>;
  averageExperience: number;
  uniqueJobTitles: string[];
  skillFrequency: Record<string, number>;
}

// Voice types
export interface Voice {
  id: string;
  name: string;
  description: string;
  language: string;
  gender: string;
  age: string;
  accent: string;
  sampleUrl?: string;
}

export interface VoiceProfile {
  id: string;
  humeVoiceId: string;
  voiceName: string;
  voiceSettings?: any;
  isActive: boolean;
  createdAt: string;
}

// Interview types
export interface InterviewSession {
  id: string;
  sessionType: 'role_specific' | 'personality_career';
  status: 'in_progress' | 'completed' | 'paused';
  questionsGenerated?: string[];
  currentQuestionIndex: number;
  totalQuestions?: number;
  startedAt: string;
  completedAt?: string;
  responses?: InterviewResponse[];
}

export interface InterviewResponse {
  id: string;
  questionText: string;
  responseAudioUrl?: string;
  responseTranscript?: string;
  responseDuration?: number;
  questionOrder: number;
  createdAt: string;
}

export interface InterviewAnalytics {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  totalResponses: number;
  averageResponseTime: number;
  sessionTypeStats: Record<string, number>;
}

// Conversation types
export interface Conversation {
  id: string;
  recruiterSessionId: string;
  recruiterName?: string;
  recruiterCompany?: string;
  conversationStart: string;
  conversationEnd?: string;
  totalMessages: number;
  status: 'active' | 'ended' | 'paused';
  messages?: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  messageType: 'recruiter_question' | 'twin_response';
  messageText: string;
  audioUrl?: string;
  messageOrder: number;
  createdAt: string;
}

export interface ConversationAnalytics {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  averageMessagesPerConversation: number;
  messageTypeStats: Record<string, number>;
}

// Form types
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface ProfileForm {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Request types
export interface StartInterviewRequest {
  sessionType: 'role_specific' | 'personality_career';
  resumeId?: string;
}

export interface SubmitResponseRequest {
  sessionId: string;
  questionText: string;
  audioData?: string;
  transcript?: string;
  duration?: number;
}

export interface StartConversationRequest {
  recruiterName?: string;
  recruiterCompany?: string;
}

export interface ProcessMessageRequest {
  conversationId: string;
  messageText: string;
  audioData?: string;
}

export interface SpeechGenerationRequest {
  text: string;
  voiceId: string;
  settings?: any;
}

export interface SpeechGenerationResponse {
  message: string;
  audioUrl: string;
}

export interface SpeechStatusResponse {
  status: string;
  audioUrl?: string;
}

// Loading states
export interface LoadingState {
  isLoading: boolean;
  error?: string;
}