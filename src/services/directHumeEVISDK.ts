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
  type: 'user_message' | 'assistant_message' | 'audio_output' | 'user_interruption' | 'error' | 'tool_call' | 'tool_response';
  content?: string;
  timestamp: string;
  emotions?: any;
  toolCall?: any;
  toolResponse?: any;
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
  private audioEndHandlerAttached: boolean = false;

  // Backend API base URL
  private baseUrl: string;

  constructor() {
    // Use environment variable for API URL
    this.baseUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/interview`;
    
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

    // Reset audio player state for new interview
    this.audioPlayer = null;
    this.audioEndHandlerAttached = false;

    this.isConnecting = true;
    console.log('🚀 Connecting to existing EVI config...');

    try {
      // Get audio stream first for proper SDK initialization (CRITICAL FIX)
      console.log('🎤 Getting audio stream for SDK...');
      this.mediaStream = await getAudioStream();
      console.log('✅ Audio stream obtained for SDK');

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

    // Reset audio player state for new interview
    this.audioPlayer = null;
    this.audioEndHandlerAttached = false;

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

      // Debug: Log token details
      console.log('🔐 Access Token received:', {
        tokenPreview: accessToken.substring(0, 50) + '...',
        tokenLength: accessToken.length,
        tokenType: typeof accessToken,
        startsWithEyJ: accessToken.startsWith('eyJ')
      });

      // Step 3: Create socket configuration
      console.log('🔌 Creating socket configuration...');
      console.log('🆔 Using Config ID:', configId);

      const socketConfig = createSocketConfig({
        auth: {
          type: 'accessToken',  // Use accessToken, not apiKey
          value: accessToken
        },
        configId: configId,
        debug: true // Enable debug temporarily to see what's happening
      });

      // Step 4: Get audio stream first for proper SDK initialization
      console.log('🎤 Getting audio stream for SDK...');
      this.mediaStream = await getAudioStream();
      console.log('✅ Audio stream obtained for SDK');

      // Step 5: Create VoiceClient with socket config and audio stream
      this.voiceClient = new VoiceClient(socketConfig);

      // Set up event handlers
      this.setupVoiceClientHandlers();

      // Connect to Hume (no parameters)
      console.log('🔗 Attempting WebSocket connection to Hume...');
      try {
        // Connect without parameters - audio will be sent manually after connection
        await this.voiceClient.connect();
        console.log('✅ Connected to Hume EVI via SDK');
      } catch (wsError: any) {
        console.error('🔴 WebSocket Connection Error:', {
          message: wsError.message,
          stack: wsError.stack,
          error: wsError,
          configId: configId,
          tokenLength: accessToken?.length
        });

        // Test raw WebSocket as diagnostic
        console.log('🧪 Testing raw WebSocket connection as diagnostic...');
        const testWsUrl = `wss://api.hume.ai/v0/evi/chat?access_token=${accessToken}&config_id=${configId}`;
        const testWs = new WebSocket(testWsUrl);

        testWs.onopen = () => {
          console.log('✅ Raw WebSocket connected successfully! Issue is with SDK configuration.');
          testWs.close();
        };

        testWs.onerror = (e) => {
          console.error('❌ Raw WebSocket also failed:', e);
          console.log('🔍 This indicates an authentication or network issue, not SDK issue');
        };

        // Try to provide more specific error message
        if (wsError.message?.includes('401') || wsError.message?.includes('Unauthorized')) {
          throw new Error('Authentication failed: Invalid or expired access token');
        } else if (wsError.message?.includes('404')) {
          throw new Error('Configuration not found: The EVI config may have expired or been deleted');
        } else if (wsError.message?.includes('network')) {
          throw new Error('Network error: Unable to connect to Hume servers');
        }
        throw wsError;
      }

      this.currentSession = {
        sessionId,
        interviewId,
        configId,
        status: 'connecting'  // Will be updated to 'connected' in 'open' event
      };

      // Audio is already connected to SDK
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

      // Start audio recording after connection is established
      try {
        await this.startAudioRecording();
        console.log('✅ Audio recording started');
      } catch (error) {
        console.error('❌ Failed to start audio recording:', error);
        this.emit('error', error);
      }

      console.log('🔊 Audio player will be initialized when first AI audio is received');

      // Update session status
      if (this.currentSession) {
        this.currentSession.status = 'connected';
      }

      this.emit('connected');
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

    // 🔍 DEBUG: Log ALL message details to see what Hume is sending
    if (message.type === 'audio_output') {
      console.log('🔊 AUDIO OUTPUT MESSAGE:', JSON.stringify(message, null, 2));
    } else if (message.type === 'assistant_message') {
      console.log('💬 ASSISTANT MESSAGE:', JSON.stringify(message, null, 2));
    } else {
      console.log('📨 Message details:', JSON.stringify(message, null, 2));
    }

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

      case 'tool_call':
      case 'function_call':
        console.log('🔧 Tool call received:', message);
        await this.handleToolCall(message);
        break;

      case 'tool_response':
      case 'tool_result':
        console.log('🔧 Tool response received:', message);
        this.emit('tool_response', message);
        break;

      default:
        console.log('📨 Unknown message:', message.type, message);
    }
  }

  /**
   * Handle tool call from Hume EVI
   */
  private async handleToolCall(message: any): Promise<void> {
    try {
      console.log('🔧 Processing tool call:', JSON.stringify(message, null, 2));

      // Extract tool call information from message
      const toolCall = message.tool_call || message.function_call || message;
      const toolCallId = toolCall.id || toolCall.tool_call_id || message.id;
      const functionName = toolCall.function?.name || toolCall.name || 'fetch_candidate_info';
      const parameters = toolCall.function?.arguments || toolCall.arguments || toolCall.parameters;

      console.log('🔧 Tool call details:', {
        toolCallId,
        functionName,
        parameters: typeof parameters === 'string' ? JSON.parse(parameters) : parameters
      });

      // Parse parameters if they're a string
      let parsedParams;
      try {
        parsedParams = typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
      } catch (e) {
        console.error('❌ Failed to parse tool parameters:', parameters);
        parsedParams = { question: parameters || 'Unknown question' };
      }

      const question = parsedParams.question || parsedParams.query || 'What can you tell me about this candidate?';

      // Get current session to extract user ID
      const currentSession = this.getCurrentSession();
      if (!currentSession) {
        console.error('❌ No current session for tool call');
        return;
      }

      // Extract user ID from session (assuming it's stored in sessionId or interviewId)
      const userId = currentSession.sessionId.split('-')[0] || currentSession.interviewId;

      console.log('🔧 Making tool call request to backend:', {
        userId,
        question,
        toolCallId,
        endpoint: `${this.baseUrl}/get-answer`
      });

      // Make HTTP request to backend endpoint
      const response = await fetch(`${this.baseUrl}/get-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          question: question,
          tool_call_id: toolCallId
        })
      });

      console.log('🔧 Tool call response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get tool response' }));
        console.error('❌ Tool call failed:', errorData);
        return;
      }

      const responseData = await response.json();
      console.log('✅ Tool call response:', responseData);

      // Send tool response back to Hume EVI
      if (this.voiceClient && toolCallId) {
        const toolResponse = {
          type: 'tool_response',
          tool_call_id: toolCallId,
          content: responseData.answer || responseData.result || 'Tool call completed successfully'
        };

        console.log('📤 Sending tool response to Hume:', toolResponse);

        // Send the tool response back to Hume using the generic send method
        try {
          if (typeof this.voiceClient.send === 'function') {
            this.voiceClient.send(JSON.stringify(toolResponse));
          } else if (typeof this.voiceClient.sendMessage === 'function') {
            this.voiceClient.sendMessage(toolResponse);
          } else {
            console.error('❌ No suitable send method found on VoiceClient');
          }
        } catch (sendError) {
          console.error('❌ Error sending tool response:', sendError);
        }
      }

      this.emit('tool_call_completed', { toolCallId, response: responseData });

    } catch (error) {
      console.error('❌ Error handling tool call:', error);
      this.emit('tool_call_error', { error, message });
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

      // Set up audio end detection ONLY ONCE when player is initialized
      if (!this.audioEndHandlerAttached) {
        this.audioPlayer.on('end', () => {
          console.log('✅ AI audio playback completed');
          this.emit('audio_end'); // Signal audio playback ended
        });
        this.audioEndHandlerAttached = true;
        console.log('✅ Audio end handler attached');
      }

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

      // Event handler is already attached in initializeAudioPlayer
      // No need to add it again here

      console.log('✅ AI audio enqueued for playback');
      
    } catch (error) {
      console.error('❌ Error playing audio:', error);
      this.emit('audio_end'); // Ensure we reset state on error
    }
  }

  /**
   * Start audio recording with MediaRecorder
   */
  private async startAudioRecording(): Promise<void> {
    console.log('🎤 Starting audio recording...');

    if (!this.mediaStream) {
      throw new Error('No media stream available');
    }

    if (!this.voiceClient) {
      throw new Error('Voice client not connected');
    }

    // Set up MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    console.log('🎤 Using MIME type:', mimeType);
    this.recorder = new MediaRecorder(this.mediaStream, { mimeType });

    // Handle audio data
    this.recorder.ondataavailable = async (event: BlobEvent) => {
      if (event.data.size > 0 && this.voiceClient) {
        try {
          // Convert Blob to ArrayBuffer
          const arrayBuffer = await event.data.arrayBuffer();

          // Send as Uint8Array which is what Hume expects
          const audioData = new Uint8Array(arrayBuffer);

          // Send audio to Hume
          this.voiceClient.sendAudio(audioData);
          console.log('🎤 Audio chunk sent - size:', audioData.length, 'bytes');
        } catch (error) {
          console.error('❌ Error sending audio:', error);
        }
      }
    };

    this.recorder.onstart = () => {
      console.log('🎤 MediaRecorder started');
      this.isRecording = true;
    };

    this.recorder.onerror = (error) => {
      console.error('❌ MediaRecorder error:', error);
    };

    // Start recording with 100ms chunks
    this.recorder.start(100);
    console.log('✅ Audio recording started');
  }

  /**
   * Start recording (for compatibility with UI)
   */
  async startRecording(): Promise<void> {
    console.log('🎤 startRecording called');
    // Recording is already started in the 'open' event handler
    // This method is kept for UI compatibility
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

      // SDK will stop audio handling on disconnect
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
          // Remove event listeners before disposal
          if (this.audioEndHandlerAttached) {
            this.audioPlayer.off('end');
            this.audioEndHandlerAttached = false;
            console.log('🧹 Removed audio end event listener');
          }

          // Stop any playing audio before disposal
          try {
            this.audioPlayer.stop();
          } catch (e) {
            // Ignore stop errors
          }

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