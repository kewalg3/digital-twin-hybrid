/**
 * Raw WebSocket Connection to Hume AI EVI
 *
 * Documentation:
 * - WebSocket API: https://dev.hume.ai/reference/speech-to-speech-evi/chat
 * - Audio Guide: https://dev.hume.ai/docs/speech-to-speech-evi/guides/audio
 * - Context Injection: https://dev.hume.ai/docs/speech-to-speech-evi/features/context-injection
 * - Session Settings: https://dev.hume.ai/docs/speech-to-speech-evi/configuration/session-settings
 */

// ============================================
// TYPES AND INTERFACES
// ============================================

export interface EVIMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
}

export interface EVISessionData {
  sessionId: string;
  configId: string;
  status: 'connecting' | 'connected' | 'disconnected';
}

export interface JobContext {
  experienceId?: string;
  title?: string;
  company?: string;
  description?: string;
}

// ============================================
// EVENT EMITTER FOR REACT INTEGRATION
// ============================================

class EventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, callback: Function) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event: string, ...args: any[]) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(...args));
    }
  }

  off(event: string, callback: Function) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
  }
}

// ============================================
// RAW WEBSOCKET EVI CLASS
// ============================================

class RawWebSocketEVI extends EventEmitter {
  // Connection state
  private socket: WebSocket | null = null;
  private isConnecting = false;
  private currentSession: EVISessionData | null = null;

  // Audio state
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioQueue: Blob[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private isMuted = false;

  // Configuration
  private baseUrl = 'http://localhost:3001/api/interview';
  private userId: string | null = null;

  // Message storage
  private messages: EVIMessage[] = [];

  // ============================================
  // PUBLIC API METHODS
  // ============================================

  /**
   * Start a new EVI interview session with raw WebSocket
   */
  async startInterview(
    userId: string,
    interviewType: 'job_experience' | 'contextual' | 'work_style' | 'profile_screening',
    jobContext?: JobContext
  ): Promise<EVISessionData> {
    console.log('🔴 === STARTING RAW WEBSOCKET EVI IMPLEMENTATION ===');
    console.log('🚀 Starting raw WebSocket EVI interview...');
    console.log('📋 User ID:', userId);
    console.log('📋 Interview Type:', interviewType);
    console.log('📋 Job Context:', jobContext);

    if (this.isConnecting || this.currentSession) {
      throw new Error('Interview already active or connecting');
    }

    this.isConnecting = true;
    this.userId = userId;
    this.messages = [];

    try {
      // Step 1: Create config via backend
      console.log('📋 Creating interview config via backend...');
      const configResponse = await fetch(`${this.baseUrl}/create-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          candidateData: { id: userId },
          interviewType,
          jobContext,
          experienceId: jobContext?.experienceId
        })
      });

      if (!configResponse.ok) {
        const errorData = await configResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${configResponse.status}`);
      }

      const { configId, sessionId } = await configResponse.json();
      console.log('✅ Config created:', configId);

      // Step 2: Get access token
      console.log('🔑 Getting access token...');
      const tokenResponse = await fetch(`${this.baseUrl}/get-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      if (!tokenResponse.ok) {
        const tokenErrorData = await tokenResponse.json().catch(() => ({ error: 'Failed to get access token' }));
        throw new Error(tokenErrorData.error || 'Failed to get access token');
      }

      const { accessToken } = await tokenResponse.json();
      console.log('✅ Access token received');

      // Step 3: Connect via raw WebSocket
      await this.connectToEVIWebSocket(configId, accessToken);

      this.currentSession = {
        sessionId,
        configId,
        status: 'connecting'
      };

      return this.currentSession;

    } catch (error) {
      this.isConnecting = false;
      console.error('❌ Error starting raw WebSocket interview:', error);
      throw error;
    }
  }

  /**
   * Connect to existing EVI config with raw WebSocket
   */
  async connectToExistingConfig(
    configId: string,
    accessToken: string,
    sessionId: string,
    userId?: string
  ): Promise<EVISessionData> {
    console.log('🔴 === CONNECTING TO EXISTING CONFIG WITH RAW WEBSOCKET ===');
    console.log('📋 Config ID:', configId);
    console.log('📋 Session ID:', sessionId);
    console.log('📋 User ID:', userId);

    if (this.isConnecting || this.currentSession) {
      throw new Error('Interview already active or connecting');
    }

    this.isConnecting = true;
    this.userId = userId || null;
    this.messages = [];

    try {
      // Connect via raw WebSocket
      await this.connectToEVIWebSocket(configId, accessToken);

      this.currentSession = {
        sessionId,
        configId,
        status: 'connecting'
      };

      return this.currentSession;

    } catch (error) {
      this.isConnecting = false;
      console.error('❌ Error connecting to existing config with raw WebSocket:', error);
      throw error;
    }
  }

  // ============================================
  // RAW WEBSOCKET CONNECTION
  // ============================================

  /**
   * Connect to Hume AI EVI via raw WebSocket
   */
  private async connectToEVIWebSocket(configId: string, accessToken: string): Promise<void> {
    console.log('🔌 === RAW WEBSOCKET CONNECTION START ===');

    try {
      // Construct WebSocket URL with query parameters
      const wsUrl = new URL('wss://api.hume.ai/v0/evi/chat');
      wsUrl.searchParams.set('access_token', accessToken);
      wsUrl.searchParams.set('config_id', configId);
      wsUrl.searchParams.set('verbose_transcription', 'true'); // Enable interim transcripts

      console.log('🔗 WebSocket URL constructed:', wsUrl.toString().replace(accessToken, '[TOKEN]'));

      // Create raw WebSocket connection
      this.socket = new WebSocket(wsUrl.toString());

      // Setup event listeners
      this.setupWebSocketEventHandlers();

      console.log('✅ Raw WebSocket connection initiated');

    } catch (error) {
      console.error('❌ Failed to create raw WebSocket connection:', error);
      throw error;
    }
  }

  /**
   * Setup raw WebSocket event handlers
   */
  private setupWebSocketEventHandlers(): void {
    if (!this.socket) return;

    console.log('🔧 Setting up raw WebSocket event handlers...');

    // Connection opened
    this.socket.addEventListener('open', async () => {
      console.log('✅ === RAW WEBSOCKET CONNECTION OPENED ===');
      console.log('🕰️ Connection open timestamp:', new Date().toISOString());

      this.isConnecting = false;

      // Update session status
      if (this.currentSession) {
        this.currentSession.status = 'connected';
      }

      // STEP 1: Inject resume context immediately via Session Settings message
      console.log('🎯 === SESSION SETTINGS CONTEXT INJECTION ===');
      await this.injectResumeContextViaSessionSettings();

      // STEP 2: Start audio capture
      await this.startAudioCapture();

      // Emit connected event
      this.emit('connected');
    });

    // Handle incoming messages
    this.socket.addEventListener('message', (event: MessageEvent) => {
      this.handleWebSocketMessage(event);
    });

    // Handle errors
    this.socket.addEventListener('error', (event: Event) => {
      console.error('❌ Raw WebSocket error:', event);
      this.emit('error', event);
    });

    // Handle connection close
    this.socket.addEventListener('close', (event: CloseEvent) => {
      console.log('🔌 Raw WebSocket closed:', event.code, event.reason);
      this.cleanup();
      this.emit('disconnected');
    });
  }

  // ============================================
  // SESSION SETTINGS CONTEXT INJECTION
  // ============================================

  /**
   * Inject resume context via Session Settings message (proper Hume API approach)
   */
  private async injectResumeContextViaSessionSettings(): Promise<void> {
    console.log('📝 === INJECTING RESUME CONTEXT VIA SESSION SETTINGS ===');

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('❌ Cannot inject context: WebSocket not open');
      return;
    }

    if (!this.userId) {
      console.error('❌ Cannot inject context: No user ID set');
      return;
    }

    try {
      // Fetch context from backend
      console.log('🌐 Fetching resume context from backend...');
      const contextResponse = await fetch(`${this.baseUrl}/get-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId })
      });

      if (!contextResponse.ok) {
        console.error('❌ Failed to fetch context:', contextResponse.status);
        return;
      }

      const contextData = await contextResponse.json();

      if (!contextData.success || !contextData.context) {
        console.error('❌ Invalid context data:', contextData);
        return;
      }

      console.log('✅ Context fetched:', contextData.context.length, 'characters');
      console.log('📋 Context preview:', contextData.context.substring(0, 200) + '...');

      // Send Session Settings message via raw WebSocket
      const sessionSettingsMessage = {
        type: "session_settings",
        context: {
          text: contextData.context,
          type: "persistent" // Context persists for entire chat session
        }
      };

      console.log('📤 Sending Session Settings message...');
      this.socket.send(JSON.stringify(sessionSettingsMessage));
      console.log('✅ Session Settings message sent successfully!');
      console.log('🎆 Resume context injected - EVI should now have access to real data');

    } catch (error) {
      console.error('❌ Failed to inject resume context:', error);
    }
  }

  // ============================================
  // AUDIO INPUT (Microphone → EVI)
  // ============================================

  /**
   * Start capturing audio from microphone
   */
  private async startAudioCapture(): Promise<void> {
    console.log('🎤 === STARTING AUDIO CAPTURE ===');

    try {
      // Request microphone access with echo cancellation
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,  // Prevent EVI from hearing itself
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      console.log('🎤 Microphone access granted');

      // Create MediaRecorder with WebM format
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error('WebM/Opus not supported');
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: mimeType
      });

      // Handle audio data chunks
      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data.size < 1) return;

        // If muted, send silence instead of actual audio
        if (this.isMuted) {
          const silence = new Blob([new Uint8Array(event.data.size)], {
            type: mimeType
          });
          await this.sendAudioInput(silence);
          return;
        }

        // Send actual audio
        await this.sendAudioInput(event.data);
      };

      // Start recording in 100ms chunks (recommended for web applications)
      this.mediaRecorder.start(100);
      console.log('🎙️ Recording started (100ms chunks)');

    } catch (error) {
      console.error('❌ Failed to start audio capture:', error);
      throw error;
    }
  }

  /**
   * Send audio input to EVI via raw WebSocket
   */
  private async sendAudioInput(audioBlob: Blob): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      // Convert audio blob to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        if (!base64Audio) return;

        // Send audio_input message via raw WebSocket
        this.socket?.send(JSON.stringify({
          type: "audio_input",
          data: base64Audio
        }));
      };
      reader.readAsDataURL(audioBlob);

    } catch (error) {
      console.error('❌ Failed to send audio input:', error);
    }
  }

  // ============================================
  // AUDIO OUTPUT (EVI → Speakers)
  // ============================================

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'audio_output':
          this.handleAudioOutput(message);
          break;

        case 'user_interruption':
          console.log('🛑 User interruption detected');
          this.stopAudioPlayback();
          break;

        case 'user_message':
          console.log('💬 User message:', message.message?.content);
          this.stopAudioPlayback();

          // Add to message history
          if (message.message?.content) {
            this.messages.push({
              role: 'user',
              content: message.message.content,
              timestamp: Date.now()
            });
            this.emit('message', {
              role: 'user',
              content: message.message.content,
              timestamp: Date.now()
            });
          }
          break;

        case 'assistant_message':
          console.log('🤖 Assistant message:', message.message?.content);

          // Add to message history
          if (message.message?.content) {
            this.messages.push({
              role: 'assistant',
              content: message.message.content,
              timestamp: Date.now()
            });
            this.emit('message', {
              role: 'assistant',
              content: message.message.content,
              timestamp: Date.now()
            });
          }
          break;

        case 'chat_metadata':
          console.log('📊 Chat metadata:', message);
          break;

        case 'error':
          console.error('❌ EVI error:', message);
          this.emit('error', message);
          break;

        default:
          console.log('📨 Received message type:', message.type);
      }

    } catch (error) {
      console.error('❌ Failed to handle WebSocket message:', error);
    }
  }

  /**
   * Handle audio output from EVI
   */
  private handleAudioOutput(message: any): void {
    try {
      // Decode base64 audio data
      const audioData = atob(message.data);
      const bytes = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        bytes[i] = audioData.charCodeAt(i);
      }

      // Create audio blob
      const audioBlob = new Blob([bytes], { type: 'audio/wav' });

      // Add to playback queue
      this.audioQueue.push(audioBlob);

      // Start playback if not already playing
      if (!this.isPlaying && this.audioQueue.length >= 1) {
        this.playNextAudio();
      }

    } catch (error) {
      console.error('❌ Failed to handle audio output:', error);
    }
  }

  /**
   * Play next audio from queue
   */
  private playNextAudio(): void {
    if (!this.audioQueue.length || this.isPlaying) return;

    this.isPlaying = true;
    const audioBlob = this.audioQueue.shift();
    if (!audioBlob) {
      this.isPlaying = false;
      return;
    }

    // Create audio element
    const audioUrl = URL.createObjectURL(audioBlob);
    this.currentAudio = new Audio(audioUrl);

    // Emit AI speaking event
    this.emit('ai_speaking', true);

    // Play audio
    this.currentAudio.play().catch(error => {
      console.error('❌ Failed to play audio:', error);
      this.isPlaying = false;
      this.emit('ai_speaking', false);
    });

    // Handle audio end
    this.currentAudio.onended = () => {
      this.isPlaying = false;
      URL.revokeObjectURL(audioUrl); // Clean up memory
      this.emit('ai_speaking', false);

      // Play next audio in queue
      if (this.audioQueue.length) {
        this.playNextAudio();
      } else {
        this.emit('audio_end');
      }
    };
  }

  /**
   * Stop audio playback and clear queue
   */
  private stopAudioPlayback(): void {
    // Stop current audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Clear queue
    this.audioQueue.length = 0;
    this.isPlaying = false;
    this.emit('ai_speaking', false);
  }

  // ============================================
  // PUBLIC CONTROL METHODS
  // ============================================

  /**
   * Mute microphone (sends silence instead of audio)
   */
  muteMicrophone(): void {
    this.isMuted = true;
    console.log('🔇 Microphone muted');
  }

  /**
   * Unmute microphone
   */
  unmuteMicrophone(): void {
    this.isMuted = false;
    console.log('🔊 Microphone unmuted');
  }

  /**
   * Get current messages
   */
  getMessages(): EVIMessage[] {
    return this.messages;
  }

  /**
   * Get current session
   */
  getCurrentSession(): EVISessionData | null {
    return this.currentSession;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ============================================
  // CLEANUP AND DISCONNECT
  // ============================================

  /**
   * Disconnect from EVI and clean up resources
   */
  disconnect(): void {
    console.log('🔌 Disconnecting raw WebSocket EVI...');

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.cleanup();

    this.currentSession = null;
    this.isConnecting = false;

    console.log('✅ Raw WebSocket EVI disconnected');
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.stopAudioPlayback();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
  }
}

// ============================================
// EXPORT SINGLETON INSTANCE
// ============================================

export const rawWebSocketEVI = new RawWebSocketEVI();
export default rawWebSocketEVI;