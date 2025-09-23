/**
 * Direct Frontend-to-Hume EVI Connection using proper SDK approach
 * Uses @humeai/voice with createSocketConfig pattern
 */

import { VoiceClient, createSocketConfig, getAudioStream, base64ToBlob } from '@humeai/voice';
import { EVIWebAudioPlayer } from 'hume';

export interface JobContext {
  title: string;
  company: string;
  duration: string;
  location: string;
  description: string;
  skills: string[];
  software: string[];
  aiSuggestedSkills?: string[];
  aiSuggestedSoftware?: string[];
  experienceId?: string;
}

export interface EVISessionData {
  sessionId: string;
  interviewId: string;
  configId: string;
  status: 'connecting' | 'connected' | 'interviewing' | 'completed' | 'error';
}

export interface EVIMessage {
  type: 'user_message' | 'assistant_message' | 'audio_output' | 'user_interruption' | 'error';
  content?: string;
  timestamp: string;
  emotions?: any;
}

class DirectHumeEVI {
  private voiceClient: VoiceClient | null = null;
  private audioPlayer: EVIWebAudioPlayer | null = null;
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  
  // Session management
  private currentSession: EVISessionData | null = null;
  private isConnecting: boolean = false;
  private isRecording: boolean = false;
  private isEnding: boolean = false;
  private transcript: EVIMessage[] = [];
  
  // Event handlers
  private messageHandlers: Map<string, Function> = new Map();
  
  // Backend API base URL
  private baseUrl: string;

  constructor() {
    // Use environment variable for API URL
    this.baseUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/evi-interview`;
    
    console.log('🎯 DirectHumeEVI SDK initialized with baseUrl:', this.baseUrl);
  }

  /**
   * Connect to existing EVI session with config ID and access token
   * Used for recruiter screening on profile pages
   */
  async connectToExistingConfig(
    configId: string,
    accessToken: string,
    sessionId: string
  ): Promise<EVISessionData> {
    if (this.isConnecting || this.currentSession) {
      throw new Error('Interview already active or connecting');
    }

    this.isConnecting = true;
    console.log('🚀 Connecting to existing EVI config...');

    try {
      // Create socket configuration with existing config
      console.log('🔌 Creating socket configuration with existing config...');
      const socketConfig = createSocketConfig({
        auth: {
          type: 'accessToken',
          value: accessToken
        },
        configId: configId,
        debug: false
      });

      // Create VoiceClient with socket config
      this.voiceClient = new VoiceClient(socketConfig);
      
      // Set up event handlers
      this.setupVoiceClientHandlers();

      // Connect to Hume
      await this.voiceClient.connect();
      console.log('✅ Connected to Hume EVI via existing config');

      this.currentSession = {
        sessionId,
        interviewId: sessionId,
        configId,
        status: 'connecting'
      };

      return this.currentSession;

    } catch (error) {
      this.isConnecting = false;
      console.error('❌ Error connecting to existing config:', error);
      throw error;
    }
  }

  /**
   * Start a new EVI interview session
   */
  async startInterview(
    userId: string,
    interviewType: 'job_experience' | 'contextual' | 'work_style',
    jobContext?: JobContext
  ): Promise<EVISessionData> {
    if (this.isConnecting || this.currentSession) {
      throw new Error('Interview already active or connecting');
    }

    this.isConnecting = true;
    console.log('🚀 Starting direct EVI interview with SDK...');

    try {
      // Step 1: Get config ID from backend
      console.log('📋 Creating interview config via backend...');
      console.log('🌐 Request URL:', `${this.baseUrl}/create-config`);
      console.log('📦 Request body:', { userId, interviewType, jobContext });
      
      let configResponse;
      try {
        configResponse = await fetch(`${this.baseUrl}/create-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            interviewType, 
            jobContext,
            experienceId: jobContext?.experienceId 
          })
        });
      } catch (fetchError) {
        console.error('❌ Network error during config fetch:', fetchError);
        throw new Error(`Network error: ${fetchError.message}`);
      }

      console.log('📡 Config response status:', configResponse.status);
      console.log('📡 Config response ok:', configResponse.ok);

      if (!configResponse.ok) {
        const errorData = await configResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Config creation failed:', errorData);
        throw new Error(errorData.error || `HTTP ${configResponse.status}`);
      }

      const { configId, sessionId, interviewId } = await configResponse.json();
      console.log('✅ Config created:', configId);

      // Step 2: Get access token
      console.log('🔑 Getting access token...');
      console.log('🌐 Token request URL:', `${this.baseUrl}/get-token`);
      console.log('📦 Token request body:', { sessionId });
      
      const tokenResponse = await fetch(`${this.baseUrl}/get-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      console.log('📡 Token response status:', tokenResponse.status);
      console.log('📡 Token response ok:', tokenResponse.ok);

      if (!tokenResponse.ok) {
        const tokenErrorData = await tokenResponse.json().catch(() => ({ error: 'Failed to get access token' }));
        console.error('❌ Token request failed:', tokenErrorData);
        throw new Error(tokenErrorData.error || 'Failed to get access token');
      }

      const { accessToken } = await tokenResponse.json();

      // Step 3: Create socket configuration
      console.log('🔌 Creating socket configuration...');
      const socketConfig = createSocketConfig({
        auth: {
          type: 'accessToken',  // Use accessToken, not apiKey
          value: accessToken
        },
        configId: configId,
        debug: false // Disable debug to reduce console noise
      });

      // Step 4: Create VoiceClient with socket config
      this.voiceClient = new VoiceClient(socketConfig);
      
      // Set up event handlers
      this.setupVoiceClientHandlers();

      // Connect to Hume
      await this.voiceClient.connect();
      console.log('✅ Connected to Hume EVI via SDK');

      this.currentSession = {
        sessionId,
        interviewId, 
        configId,
        status: 'connecting'  // Will be updated to 'connected' in 'open' event
      };

      // Audio initialization happens in the 'open' event handler
      return this.currentSession;

    } catch (error) {
      this.isConnecting = false;
      console.error('❌ Error starting interview:', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for VoiceClient
   */
  private setupVoiceClientHandlers(): void {
    if (!this.voiceClient) return;

    console.log('🔧 Setting up VoiceClient event handlers...');

    // Connection opened
    this.voiceClient.on('open', async () => {
      console.log('✅ WebSocket connection opened');
      this.isConnecting = false;
      
      // Initialize only microphone audio after connection is established
      try {
        await this.initializeAudio();
        console.log('✅ Microphone audio initialized - ready for recording');
        console.log('🔊 Audio player will be initialized when first AI audio is received');
        
        // Update session status
        if (this.currentSession) {
          this.currentSession.status = 'connected';
        }
        
        this.emit('connected');
      } catch (error) {
        console.error('❌ Audio initialization failed:', error);
        this.emit('error', error);
      }
    });

    // Handle messages
    this.voiceClient.on('message', (message: any) => {
      this.handleVoiceMessage(message);
    });

    // Connection closed
    this.voiceClient.on('close', () => {
      console.log('🔌 Connection closed');
      this.cleanup();
      this.emit('disconnected');
    });

    // Connection error
    this.voiceClient.on('error', (error: any) => {
      console.error('❌ Connection error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Handle messages from VoiceClient
   */
  private async handleVoiceMessage(message: any): Promise<void> {
    console.log('📥 Message:', message.type);
    
    // Log timeout-related events for debugging
    if (message.type === 'timeout_warning' || message.type === 'session_ended') {
      console.log('⏰ Timeout event received:', message.type, message);
    }

    switch (message.type) {
      case 'user_message':
        console.log('👤 User:', message.message?.content);
        this.transcript.push({
          type: 'user_message',
          content: message.message?.content || '',
          timestamp: new Date().toISOString(),
          emotions: message.models?.prosody?.scores
        });
        this.emit('user_message', message);
        break;

      case 'assistant_message':
        console.log('🤖 Assistant:', message.message?.content);
        // Check if this is a timeout-related message
        const isTimeoutMessage = message.message?.content?.includes('one minute left') || 
                                message.message?.content?.includes('reached the end of our interview time');
        if (isTimeoutMessage) {
          console.log('⏰ This is a timeout-related assistant message');
        }
        this.transcript.push({
          type: 'assistant_message',
          content: message.message?.content || '',
          timestamp: new Date().toISOString(),
          emotions: message.models?.prosody?.scores
        });
        this.emit('assistant_message', message);
        break;

      case 'audio_output':
        console.log('🔊 Audio output received');
        // Initialize audio player on first audio output if not already done
        if (!this.audioPlayer) {
          try {
            console.log('🔊 Initializing audio player for first AI audio...');
            await this.initializeAudioPlayer();
            console.log('✅ Audio player initialized successfully');
          } catch (error) {
            console.error('❌ Failed to initialize audio player:', error);
            this.emit('audio_output', message); // Still emit the event even if player fails
            break;
          }
        }
        await this.playAudioOutput(message);
        this.emit('audio_output', message);
        break;

      case 'user_interruption':
        console.log('✋ User interruption');
        if (this.audioPlayer) {
          this.audioPlayer.stop();
        }
        this.emit('user_interruption', message);
        break;

      case 'error':
        console.error('❌ Error message:', message);
        this.emit('evi_error', message);
        break;

      case 'timeout_warning':
        console.log('⏰ Timeout warning received:', message);
        // Make sure the AI message is added to transcript if it has content
        if (message.message?.content) {
          this.transcript.push({
            type: 'assistant_message',
            content: message.message.content,
            timestamp: new Date().toISOString()
          });
        }
        this.emit('timeout_warning', message);
        break;
        
      case 'session_ended':
        console.log('⏰ Session ended by timeout:', message);
        // Make sure any final message is captured
        if (message.message?.content) {
          this.transcript.push({
            type: 'assistant_message', 
            content: message.message.content,
            timestamp: new Date().toISOString()
          });
        }
        this.emit('session_ended', message);
        break;
        
      case 'chat_metadata':
        console.log('📊 Chat metadata:', message.type, message);
        // Check if this contains timeout information
        if (message.type === 'chat_metadata' && message.metadata) {
          console.log('📊 Metadata details:', JSON.stringify(message.metadata, null, 2));
        }
        this.emit('chat_metadata', message);
        break;
        
      case 'assistant_end':
        console.log('🏁 Assistant finished speaking');
        this.emit('audio_end'); // Treat as audio playback ended
        break;

      default:
        console.log('📨 Unknown message:', message.type, message);
    }
  }

  /**
   * Initialize Hume's audio player
   */
  private async initializeAudioPlayer(): Promise<void> {
    try {
      console.log('🔊 Initializing Hume audio player...');
      this.audioPlayer = new EVIWebAudioPlayer();
      await this.audioPlayer.init();
      console.log('✅ Hume audio player initialized');
    } catch (error) {
      console.error('❌ Error initializing audio player:', error);
      throw error;
    }
  }

  /**
   * Play audio output from Hume
   */
  private async playAudioOutput(message: any): Promise<void> {
    try {
      if (!this.audioPlayer) {
        console.warn('⚠️ Audio player not initialized');
        return;
      }

      console.log('🔊 Playing AI audio via Hume player...');
      this.emit('audio_start'); // Signal audio playback started
      
      // Use Hume's proper audio player to handle streaming audio
      await this.audioPlayer.enqueue(message);
      
      // Set up audio end detection
      this.audioPlayer.on('end', () => {
        console.log('✅ AI audio playback completed');
        this.emit('audio_end'); // Signal audio playback ended
      });
      
      console.log('✅ AI audio enqueued for playback');
      
    } catch (error) {
      console.error('❌ Error playing audio:', error);
      this.emit('audio_end'); // Ensure we reset state on error
    }
  }

  /**
   * Initialize audio
   */
  private async initializeAudio(): Promise<void> {
    try {
      console.log('🎤 Initializing audio...');
      
      // Check microphone permissions first
      try {
        const permissionResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        console.log('🎤 Microphone permission status:', permissionResult.state);
      } catch (e) {
        console.log('⚠️ Could not check microphone permissions');
      }
      
      // Get audio stream with Hume's helper
      this.mediaStream = await getAudioStream();
      console.log('✅ Audio stream obtained');
      
      // Verify audio stream
      if (this.mediaStream) {
        const audioTracks = this.mediaStream.getAudioTracks();
        console.log('🎵 Audio tracks found:', audioTracks.length);
        if (audioTracks.length > 0) {
          console.log('🎵 First audio track settings:', audioTracks[0].getSettings());
          console.log('🎵 First audio track enabled:', audioTracks[0].enabled);
          console.log('🎵 First audio track ready state:', audioTracks[0].readyState);
          console.log('🎵 First audio track label:', audioTracks[0].label);
          
          // Test if audio is actually being captured
          try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(this.mediaStream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            
            const sum = dataArray.reduce((a, b) => a + b, 0);
            console.log('🎵 Audio level test - sum:', sum, 'dataArray length:', dataArray.length);
            
            audioContext.close();
          } catch (audioTestError) {
            console.warn('⚠️ Audio level test failed:', audioTestError);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error initializing audio:', error);
      
      // Provide specific error messages
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone access denied. Please allow microphone permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else {
        throw new Error(`Failed to initialize audio: ${error.message}`);
      }
    }
  }

  /**
   * Start recording
   */
  async startRecording(): Promise<void> {
    console.log('🎤 startRecording called. Current state:', {
      hasVoiceClient: !!this.voiceClient,
      hasMediaStream: !!this.mediaStream,
      isRecording: this.isRecording,
      currentSession: !!this.currentSession
    });

    if (!this.voiceClient) {
      console.error('❌ Voice client not available. Connection may have been lost.');
      throw new Error('Voice client not connected');
    }
    
    if (!this.mediaStream) {
      console.error('❌ Media stream not available. Audio may not be initialized.');
      throw new Error('Audio not initialized - microphone access required');
    }

    if (this.isRecording) {
      console.log('⚠️ Already recording');
      return;
    }

    try {
      console.log('🎤 Starting/Resuming recording...');
      
      // Create new MediaRecorder for resume (old one may be in 'inactive' state)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      console.log('🎤 Using MIME type:', mimeType);
      this.recorder = new MediaRecorder(this.mediaStream, { mimeType });
      
      this.recorder.ondataavailable = async (event: BlobEvent) => {
        console.log('🎤 MediaRecorder data available - size:', event.data.size, 'type:', event.data.type);
        
        if (event.data.size > 0 && this.voiceClient) {
          try {
            console.log('🎤 Sending audio blob directly - size:', event.data.size, 'type:', event.data.type);
            
            // Send audio blob directly to VoiceClient
            await this.voiceClient.sendAudio(event.data);
            console.log('✅ Audio sent successfully to Hume');
          } catch (error) {
            console.error('❌ Error sending audio:', error);
          }
        } else if (event.data.size === 0) {
          console.warn('⚠️ Received empty audio data');
        } else if (!this.voiceClient) {
          console.warn('⚠️ VoiceClient not available when trying to send audio');
        }
      };
      
      this.recorder.onstart = () => {
        console.log('🎤 MediaRecorder started');
      };
      
      this.recorder.onpause = () => {
        console.log('🎤 MediaRecorder paused');
      };
      
      this.recorder.onresume = () => {
        console.log('🎤 MediaRecorder resumed');
      };
      
      this.recorder.onstop = () => {
        console.log('🎤 MediaRecorder stopped');
      };
      
      this.recorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
      };

      this.recorder.start(100); // 100ms chunks
      this.isRecording = true;
      console.log('✅ Recording started/resumed');
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
      console.log('🛑 Recording stopped');
    }
  }

  /**
   * End interview
   */
  async endInterview(providedSessionId?: string, providedTranscript?: EVIMessage[]): Promise<{ transcript: EVIMessage[]; sessionId: string }> {
    console.log('🏁 endInterview called. Current state:', {
      currentSession: !!this.currentSession,
      voiceClient: !!this.voiceClient,
      isRecording: this.isRecording,
      isEnding: this.isEnding,
      transcriptLength: this.transcript.length,
      providedSessionId,
      providedTranscriptLength: providedTranscript?.length || 0
    });

    if (this.isEnding) {
      console.warn('⚠️ Interview is already being ended, skipping duplicate call');
      return {
        transcript: providedTranscript || this.transcript,
        sessionId: providedSessionId || this.currentSession?.sessionId || ''
      };
    }

    // Use provided transcript if available
    if (providedTranscript && providedTranscript.length > 0) {
      this.transcript = providedTranscript;
      console.log('📋 Using provided transcript with', providedTranscript.length, 'messages');
    }

    // Handle case where we don't have a current session but have a session ID
    if (!this.currentSession && providedSessionId) {
      console.log('⚠️ No current session, but have provided session ID, creating minimal session data');
      // Return without trying to access null session
      return {
        transcript: this.transcript,
        sessionId: providedSessionId
      };
    }

    if (!this.currentSession) {
      console.error('❌ No active session found when ending interview');
      throw new Error('No active session');
    }

    this.isEnding = true;

    try {
      console.log('🏁 Ending interview...');
      
      // Stop recording first
      this.stopRecording();
      
      // Gracefully disconnect voice client
      if (this.voiceClient) {
        console.log('🔌 Checking voice client connection state...');
        try {
          // Check if WebSocket is already closed (readyState 3 means CLOSED)
          // We need to check the internal WebSocket state if possible
          const socket = (this.voiceClient as any).socket || (this.voiceClient as any)._socket || (this.voiceClient as any).ws;
          if (socket && socket.readyState === 3) {
            console.log('⚠️ WebSocket already closed, skipping disconnect');
          } else {
            console.log('🔌 Disconnecting voice client...');
            await this.voiceClient.disconnect();
            console.log('✅ Voice client disconnected');
          }
        } catch (error) {
          console.warn('⚠️ Error disconnecting voice client:', error);
          // Continue anyway - the connection might already be closed
        }
      }

      // Skip saving transcript here - it will be saved by the complete endpoint
      console.log('💾 Transcript will be saved by complete endpoint');
      const finalSessionId = providedSessionId || this.currentSession?.sessionId;

      const result = {
        transcript: this.transcript,
        sessionId: finalSessionId || ''
      };

      this.cleanup();
      console.log('✅ Interview completed');
      
      return result;
      
    } catch (error) {
      console.error('❌ Error ending interview:', error);
      throw error;
    }
  }

  /**
   * Register event handler
   */
  onMessage(eventType: string, handler: Function): void {
    this.messageHandlers.set(eventType, handler);
  }

  /**
   * Emit event
   */
  private emit(eventType: string, data?: any): void {
    const handler = this.messageHandlers.get(eventType);
    if (handler) {
      handler(data);
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): EVISessionData | null {
    return this.currentSession;
  }

  /**
   * Get transcript
   */
  getTranscript(): EVIMessage[] {
    return [...this.transcript];
  }

  /**
   * Check if recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Check if properly connected and ready
   */
  isConnectedAndReady(): boolean {
    // Don't require audioPlayer since it's initialized on first AI audio
    const ready = !!(this.voiceClient && this.mediaStream && this.currentSession);
    console.log('🔍 isConnectedAndReady check:', {
      voiceClient: !!this.voiceClient,
      mediaStream: !!this.mediaStream,
      audioPlayer: !!this.audioPlayer,
      currentSession: !!this.currentSession,
      ready
    });
    return ready;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    // Prevent multiple cleanup calls
    if (!this.voiceClient && !this.mediaStream && !this.currentSession) {
      console.log('🔄 Cleanup already completed, skipping');
      return;
    }
    
    console.log('🧹 Cleaning up...');
    
    try {
      this.stopRecording();
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      // Cleanup audio player
      if (this.audioPlayer) {
        try {
          this.audioPlayer.dispose();
        } catch (e) {
          // Ignore dispose errors
        }
        this.audioPlayer = null;
      }
      
      // Disconnect without triggering events to prevent loops
      if (this.voiceClient) {
        const client = this.voiceClient;
        this.voiceClient = null; // Clear reference first
        try {
          client.disconnect();
        } catch (e) {
          // Ignore disconnect errors during cleanup
        }
      }
      
      this.currentSession = null;
      this.isConnecting = false;
      this.isRecording = false;
      this.isEnding = false;
      this.transcript = [];
      this.messageHandlers.clear();
      
      console.log('✅ Cleanup complete');
      
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}

// Export singleton
export const directHumeEVI = new DirectHumeEVI();
export default DirectHumeEVI;