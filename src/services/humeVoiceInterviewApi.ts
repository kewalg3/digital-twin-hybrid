// New Hume WebSocket API service replacing Socket.IO
export interface JobContext {
  title: string;
  company: string;
  duration: string;
  location: string;
  description: string;
  skills: string[];
  software: string[];
  experienceId?: string;
}

export interface InterviewQuestion {
  text: string;
  type: 'opening' | 'follow_up' | 'clarification' | 'closing';
  audioBuffer?: ArrayBuffer;
  audioFormat?: string;
}

export interface InterviewSummary {
  overview: string;
  keyInsights: {
    strengths: string[];
    achievements: string[];
    skills: string[];
    workStyle: string;
    challenges: string;
  };
  digitalTwinData: {
    responsePatterns: string[];
    communicationStyle: string;
    expertiseAreas: string[];
    decisionMaking: string;
  };
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
}

export interface InterviewSession {
  sessionId: string;
  interviewId: string;
  openingQuestion: InterviewQuestion;
  selectedVoice: VoiceOption;
  status: 'ready' | 'in_progress' | 'completed' | 'error';
}

export interface InterviewResponse {
  nextQuestion?: InterviewQuestion;
  shouldContinue: boolean;
  questionNumber: number;
  isCompleted?: boolean;
  isTerminated?: boolean;
  closingMessage?: {
    text: string;
    audioBuffer?: ArrayBuffer;
    audioFormat?: string;
  };
  summary?: InterviewSummary;
  warningMessage?: string;
  isWarning?: boolean;
}

class HumeVoiceInterviewApi {
  private baseUrl: string;
  private currentSession: InterviewSession | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private isRecording: boolean = false;

  constructor() {
    this.baseUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/voice-interview`;
  }

  /**
   * Get available voice options
   */
  async getVoiceOptions(): Promise<VoiceOption[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get voice options');
      }
      
      return data.data.voices;
    } catch (error) {
      console.error('❌ Error getting voice options:', error);
      throw error;
    }
  }

  /**
   * Start a new voice interview session
   */
  async startInterview(
    userId: string, 
    jobContext: JobContext, 
    selectedVoice: string = 'luna'
  ): Promise<InterviewSession> {
    try {
      console.log(`🚀 Starting Hume voice interview for ${jobContext.title} at ${jobContext.company}`);
      
      const response = await fetch(`${this.baseUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          jobContext,
          selectedVoice
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start interview');
      }

      this.currentSession = data.data;
      console.log('✅ Interview session started:', this.currentSession?.sessionId);
      
      return this.currentSession;
    } catch (error) {
      console.error('❌ Error starting interview:', error);
      throw error;
    }
  }

  /**
   * Start a job experience expansion interview
   */
  async startJobExperienceInterview(
    userId: string, 
    jobExperience: {
      jobTitle: string;
      company: string;
      description: string;
      duration: string;
      location: string;
      skills: string[];
      software: string[];
      startDate?: string;
      endDate?: string;
      isCurrentRole?: boolean;
    }, 
    selectedVoice: string = 'luna'
  ): Promise<InterviewSession> {
    try {
      console.log(`🎤 Starting job experience interview for ${jobExperience.jobTitle} at ${jobExperience.company}`);
      
      const response = await fetch(`${this.baseUrl}/job-experience`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          jobExperience,
          selectedVoice
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start job experience interview');
      }

      this.currentSession = data.data;
      console.log('✅ Job experience interview started:', this.currentSession?.sessionId);
      
      return this.currentSession;
    } catch (error) {
      console.error('❌ Error starting job experience interview:', error);
      throw error;
    }
  }

  /**
   * Initialize audio recording
   */
  async initializeAudioRecording(): Promise<void> {
    try {
      // Initialize Web Audio API
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      console.log('🎤 Audio recording initialized');
    } catch (error) {
      console.error('❌ Error initializing audio recording:', error);
      throw new Error('Failed to initialize microphone access');
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (!this.mediaRecorder) {
      await this.initializeAudioRecording();
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start();
      this.isRecording = true;
      console.log('🎤 Started recording');
    }
  }

  /**
   * Stop recording and get audio blob
   */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('MediaRecorder not active'));
        return;
      }

      const chunks: Blob[] = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        this.isRecording = false;
        console.log('🎤 Stopped recording, audio size:', audioBlob.size);
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Send audio input to the interview
   */
  async sendAudioInput(audioBlob: Blob): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active interview session');
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('sessionId', this.currentSession.sessionId);

      const response = await fetch(`${this.baseUrl}/audio`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to send audio');
      }

      console.log('✅ Audio sent successfully');
    } catch (error) {
      console.error('❌ Error sending audio:', error);
      throw error;
    }
  }

  /**
   * Process transcript from speech recognition
   */
  async processTranscript(
    transcript: string, 
    emotions?: any
  ): Promise<InterviewResponse> {
    if (!this.currentSession) {
      throw new Error('No active interview session');
    }

    try {
      console.log(`📝 Processing transcript: "${transcript.substring(0, 50)}..."`);
      
      const response = await fetch(`${this.baseUrl}/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId,
          transcript,
          emotions
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to process transcript');
      }

      console.log('✅ Transcript processed successfully');
      return data.data;
    } catch (error) {
      console.error('❌ Error processing transcript:', error);
      throw error;
    }
  }

  /**
   * End the current interview session
   * Now handles missing sessions gracefully to prevent completion flow failure
   */
  async endInterview(): Promise<InterviewResponse> {
    try {
      // If no active session, return mock response to allow completion flow to continue
      if (!this.currentSession) {
        console.warn('⚠️ No active interview session found - returning mock response to allow completion');
        return {
          shouldContinue: false,
          questionNumber: 0,
          isCompleted: true,
          closingMessage: {
            text: "Interview session completed"
          },
          summary: {
            overview: "Interview completed without active session",
            keyInsights: {
              strengths: [],
              achievements: [],
              skills: [],
              workStyle: "Not available",
              challenges: "Not available"
            },
            digitalTwinData: {
              responsePatterns: [],
              communicationStyle: "Not available",
              expertiseAreas: [],
              decisionMaking: "Not available"
            }
          }
        };
      }

      console.log(`🏁 Ending interview session: ${this.currentSession.sessionId}`);
      
      const response = await fetch(`${this.baseUrl}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        console.warn('⚠️ Failed to end interview via API, but continuing with completion flow');
        // Don't throw error - allow completion to proceed
        return {
          shouldContinue: false,
          questionNumber: 0,
          isCompleted: true,
          closingMessage: {
            text: "Interview session completed"
          }
        };
      }

      console.log('✅ Interview ended successfully');
      
      // Clean up session
      this.cleanup();
      
      return data.data;
    } catch (error) {
      console.error('❌ Error ending interview:', error);
      // Don't throw error - return fallback response to allow completion
      console.log('🔄 Returning fallback response to allow completion flow to continue');
      return {
        shouldContinue: false,
        questionNumber: 0,
        isCompleted: true,
        closingMessage: {
          text: "Interview session completed with errors"
        }
      };
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(): Promise<any> {
    if (!this.currentSession) {
      throw new Error('No active interview session');
    }

    try {
      const response = await fetch(`${this.baseUrl}/status/${this.currentSession.sessionId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get session status');
      }

      return data.data;
    } catch (error) {
      console.error('❌ Error getting session status:', error);
      throw error;
    }
  }

  /**
   * Play audio from buffer (handles both ArrayBuffer and base64 data)
   */
  async playAudio(audioData: any): Promise<void> {
    try {
      console.log('🔊 Attempting to play audio...', typeof audioData);
      
      // Check if audioData has the Buffer structure from Hume
      let audioBuffer: ArrayBuffer;
      
      if (audioData && audioData.type === 'Buffer' && audioData.data) {
        // Convert Buffer data array to ArrayBuffer
        const uint8Array = new Uint8Array(audioData.data);
        audioBuffer = uint8Array.buffer;
      } else if (typeof audioData === 'string') {
        // Handle base64 string
        audioBuffer = this.base64ToArrayBuffer(audioData);
      } else if (audioData instanceof ArrayBuffer) {
        // Already an ArrayBuffer
        audioBuffer = audioData;
      } else {
        throw new Error('Unsupported audio data format');
      }

      // Create audio element for MP3 playback (Hume returns MP3)
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Play the audio
      await audio.play();
      
      console.log('✅ Audio played successfully');
      
      // Clean up URL after playback
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
    } catch (error) {
      console.error('❌ Error playing audio:', error);
      console.error('Audio data:', audioData);
      
      // Try fallback text-to-speech
      if ('speechSynthesis' in window) {
        console.log('🔄 Falling back to browser TTS');
        // We would need the text content for this fallback
      }
      
      throw error;
    }
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get current session info
   */
  getCurrentSession(): InterviewSession | null {
    return this.currentSession;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Stop recording if active
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    // Clean up session
    this.currentSession = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.isRecording = false;

    console.log('🧹 Hume voice interview API cleaned up');
  }
}

// Create singleton instance
export const humeVoiceInterviewApi = new HumeVoiceInterviewApi();