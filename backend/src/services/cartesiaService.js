const fs = require('fs').promises;
const path = require('path');

class CartesiaService {
  constructor() {
    this.apiKey = process.env.CARTESIA_API_KEY;
    this.baseURL = 'https://api.cartesia.ai';

    if (!this.apiKey) {
      console.warn('⚠️ CARTESIA_API_KEY not found in environment variables');
    }
  }

  /**
   * Get available voices from Cartesia
   */
  async getAvailableVoices() {
    try {
      const response = await fetch(`${this.baseURL}/voices`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Cartesia API error: ${response.status}`);
      }

      const data = await response.json();

      // Return formatted voice data
      return data.voices || [];
    } catch (error) {
      console.error('Failed to get Cartesia voices:', error);

      // Return fallback voices for development
      return [
        {
          id: 'cartesia-male-1',
          name: 'Professional Male',
          gender: 'male',
          description: 'Clear and professional male voice'
        },
        {
          id: 'cartesia-male-2',
          name: 'Warm Male',
          gender: 'male',
          description: 'Warm and friendly male voice'
        },
        {
          id: 'cartesia-female-1',
          name: 'Professional Female',
          gender: 'female',
          description: 'Clear and professional female voice'
        },
        {
          id: 'cartesia-female-2',
          name: 'Warm Female',
          gender: 'female',
          description: 'Warm and friendly female voice'
        }
      ];
    }
  }

  /**
   * Verify if a voice ID exists in Cartesia
   */
  async verifyVoiceExists(voiceId) {
    try {
      const voices = await this.getAvailableVoices();
      return voices.some(voice => voice.id === voiceId);
    } catch (error) {
      console.error('Failed to verify voice:', error);
      return false;
    }
  }

  /**
   * Clone a voice using Cartesia API
   */
  async cloneVoice(audioFile, userId, userInfo = null) {
    try {
      if (!this.apiKey) {
        throw new Error('Cartesia API key not configured');
      }

      // Create FormData for file upload
      const formData = new FormData();

      // Use buffer directly - no need for Blob in Node.js
      const audioBlob = new Blob([audioFile.buffer], { type: audioFile.mimetype });
      formData.append('clip', audioBlob, audioFile.originalname || 'voice_sample.webm');

      // Create a meaningful voice name using user info
      const firstName = userInfo?.firstName || 'User';
      const lastName = userInfo?.lastName || '';
      const uniqueId = Date.now().toString().slice(-6);
      const voiceName = `${firstName}_${lastName}_${uniqueId}`.replace(/[^a-zA-Z0-9_]/g, '');

      formData.append('name', voiceName);
      formData.append('description', `Voice clone for ${firstName} ${lastName || '(user ' + userId + ')'}`);
      formData.append('language', 'en');

      const response = await fetch(`${this.baseURL}/voices/clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Cartesia-Version': '2024-06-10'
          // Don't set Content-Type, let fetch set it for FormData
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cartesia clone API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      return {
        voiceId: result.id || result.voice_id,
        audioUrl: result.audio_url || null,
        status: 'completed'
      };
    } catch (error) {
      console.error('Voice cloning failed:', error);

      // For development/testing, return a mock result
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: Returning mock voice clone result');
        return {
          voiceId: `mock_cloned_${userId}_${Date.now()}`,
          audioUrl: null,
          status: 'completed'
        };
      }

      throw error;
    }
  }

  /**
   * Get voice by ID from Cartesia
   */
  async getVoiceById(voiceId) {
    try {
      const response = await fetch(`${this.baseURL}/voices/${voiceId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Cartesia API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get voice by ID:', error);
      return null;
    }
  }

  /**
   * Delete a cloned voice from Cartesia
   */
  async deleteVoice(voiceId) {
    try {
      const response = await fetch(`${this.baseURL}/voices/${voiceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to delete voice:', error);
      return false;
    }
  }

  /**
   * Test voice synthesis with Cartesia
   */
  async testVoiceSynthesis(voiceId, text = 'Hello, this is a test of my cloned voice.') {
    try {
      console.log('🔧 CartesiaService.testVoiceSynthesis called with voiceId:', voiceId);
      console.log('🔧 Text to synthesize:', text);

      const requestBody = {
        model_id: 'sonic-3',
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId
        },
        language: 'en',
        output_format: {
          container: 'wav',
          encoding: 'pcm_f32le',
          sample_rate: 8000
        },
        generation_config: {
          volume: 1,
          speed: 1,
          emotion: 'neutral'
        }
      };

      console.log('🚀 Sending request to Cartesia:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseURL}/tts/bytes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Cartesia-Version': '2024-06-10'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 Cartesia TTS response status:', response.status);
      console.log('📡 Cartesia TTS response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Cartesia TTS error body:', errorText);
        throw new Error(`TTS API error: ${response.status} - ${errorText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Voice synthesis test failed:', error);
      throw error;
    }
  }
}

module.exports = new CartesiaService();