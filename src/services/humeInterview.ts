/**
 * Clean Hume EVI Integration - Simple One-Tool Architecture
 * No complex tool chains, no AI rewriting - just get answer and speak verbatim
 */

export interface EVISessionData {
  sessionId: string;
  configId: string;
  status: 'connecting' | 'connected' | 'interviewing' | 'completed' | 'error';
}

export interface EVIMessage {
  type: 'user_message' | 'assistant_message';
  content: string;
  timestamp: string;
}

class HumeInterviewService {
  private socket: WebSocket | null = null;
  private userId: string | null = null;
  private currentSession: EVISessionData | null = null;
  private transcript: EVIMessage[] = [];

  // Event handlers
  private messageHandlers: Map<string, Function> = new Map();

  // Backend API base URL
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    console.log('🎯 Clean Hume Interview Service initialized');
  }

  /**
   * Start a new interview session
   */
  async startInterview(userId: string, candidateData: any, recruiterContext?: any): Promise<EVISessionData> {
    this.userId = userId;

    try {
      // Step 1: Create simple config with one tool
      console.log('📋 Creating simple EVI config...');
      const config = await this.createConfig(userId, candidateData, recruiterContext);

      // Step 2: Get access token
      console.log('🔑 Getting access token...');
      const token = await this.getAccessToken();

      // Step 3: Connect to Hume WebSocket
      console.log('🔌 Connecting to Hume WebSocket...');
      await this.connectWebSocket(config.configId, token);

      this.currentSession = {
        sessionId: config.sessionId,
        configId: config.configId,
        status: 'connected'
      };

      console.log('✅ Interview started successfully');
      return this.currentSession;

    } catch (error) {
      console.error('❌ Error starting interview:', error);
      throw error;
    }
  }

  /**
   * Create simple EVI configuration with one tool
   */
  private async createConfig(userId: string, candidateData: any, recruiterContext?: any) {
    const response = await fetch(`${this.baseUrl}/interview/create-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        candidateData,
        recruiterContext
      })
    });

    if (!response.ok) {
      throw new Error(`Config creation failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get access token for WebSocket connection
   */
  private async getAccessToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/interview/get-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.accessToken;
  }

  /**
   * Connect to Hume WebSocket
   */
  private async connectWebSocket(configId: string, accessToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.hume.ai/v0/evi/chat?access_token=${accessToken}&config_id=${configId}`;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('✅ WebSocket connected');
        this.setupMessageHandlers();
        resolve();
      };

      this.socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.socket.onclose = () => {
        console.log('🔌 WebSocket closed');
        this.emit('disconnected');
      };
    });
  }

  /**
   * Set up WebSocket message handlers
   */
  private setupMessageHandlers(): void {
    if (!this.socket) return;

    this.socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📥 Received message:', message.type);

        switch (message.type) {
          case 'user_message':
            this.handleUserMessage(message);
            break;

          case 'assistant_message':
            this.handleAssistantMessage(message);
            break;

          case 'audio_output':
            this.handleAudioOutput(message);
            break;

          case 'tool_call':
            await this.handleToolCall(message);
            break;

          default:
            console.log('📨 Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('❌ Error handling message:', error);
      }
    };
  }

  /**
   * Handle user message
   */
  private handleUserMessage(message: any): void {
    const content = message.message?.content || '';
    console.log('👤 User:', content);

    this.transcript.push({
      type: 'user_message',
      content,
      timestamp: new Date().toISOString()
    });

    this.emit('user_message', { content });
  }

  /**
   * Handle assistant message
   */
  private handleAssistantMessage(message: any): void {
    const content = message.message?.content || '';
    console.log('🤖 Assistant:', content);

    this.transcript.push({
      type: 'assistant_message',
      content,
      timestamp: new Date().toISOString()
    });

    this.emit('assistant_message', { content });
  }

  /**
   * Handle audio output
   */
  private handleAudioOutput(message: any): void {
    console.log('🔊 Audio output received');
    this.emit('audio_output', message);
  }

  /**
   * Handle tool calls - THE CRITICAL PART
   */
  private async handleToolCall(message: any): Promise<void> {
    console.log('🔧 Tool call received:', message.name);

    try {
      if (message.name === 'get_answer') {
        // Parse parameters
        const params = JSON.parse(message.parameters);
        console.log('📝 Tool parameters:', params);

        // Call our simple backend endpoint
        const answer = await this.getAnswer(params.user_id, params.question);

        // Send the complete answer back to Hume
        this.sendToolResponse(message.tool_call_id, answer);

        console.log('✅ Tool response sent');
      }
    } catch (error) {
      console.error('❌ Tool call error:', error);
      this.sendToolError(message.tool_call_id, error.message);
    }
  }

  /**
   * Get answer from backend - Returns complete conversational response
   */
  private async getAnswer(userId: string, question: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/interview/get-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        question
      })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const data = await response.json();
    return data.answer;
  }

  /**
   * Send tool response to Hume
   */
  private sendToolResponse(toolCallId: string, content: string): void {
    if (!this.socket) return;

    const response = {
      type: 'tool_response',
      tool_call_id: toolCallId,
      content
    };

    console.log('📤 Sending tool response:', content.substring(0, 100) + '...');
    this.socket.send(JSON.stringify(response));
  }

  /**
   * Send tool error to Hume
   */
  private sendToolError(toolCallId: string, error: string): void {
    if (!this.socket) return;

    const errorResponse = {
      type: 'tool_error',
      tool_call_id: toolCallId,
      error,
      fallback_content: "I'm having trouble accessing that information right now. Could you rephrase your question?"
    };

    this.socket.send(JSON.stringify(errorResponse));
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
   * Get current transcript
   */
  getTranscript(): EVIMessage[] {
    return [...this.transcript];
  }

  /**
   * End interview
   */
  async endInterview(): Promise<{ transcript: EVIMessage[]; sessionId: string }> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const result = {
      transcript: this.transcript,
      sessionId: this.currentSession?.sessionId || ''
    };

    // Reset state
    this.currentSession = null;
    this.transcript = [];
    this.messageHandlers.clear();

    return result;
  }
}

// Export singleton
export const humeInterviewService = new HumeInterviewService();
export default HumeInterviewService;