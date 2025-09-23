const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

class SupabaseStorageService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    this.bucketName = process.env.SUPABASE_BUCKET_NAME || 'resumes';
    
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      console.warn('Supabase credentials not provided. File storage will be disabled.');
      return;
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey);
  }

  async uploadResume(fileBuffer, originalFilename, userId) {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      // Generate unique filename
      const fileExtension = path.extname(originalFilename);
      const timestamp = Date.now();
      const randomId = crypto.randomBytes(8).toString('hex');
      const filename = `${userId}/${timestamp}-${randomId}${fileExtension}`;

      // Upload file to Supabase storage
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filename, fileBuffer, {
          contentType: this.getMimeType(fileExtension),
          metadata: {
            originalFilename: originalFilename,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString()
          }
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw new Error(`File upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filename);

      return {
        filename: filename,
        originalFilename: originalFilename,
        fileUrl: urlData.publicUrl,
        fileSize: fileBuffer.length,
        mimeType: this.getMimeType(fileExtension),
        uploadedAt: new Date()
      };

    } catch (error) {
      console.error('Resume upload error:', error);
      throw new Error(`Resume upload failed: ${error.message}`);
    }
  }

  async downloadResume(filename) {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .download(filename);

      if (error) {
        throw new Error(`Download failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Resume download error:', error);
      throw new Error(`Resume download failed: ${error.message}`);
    }
  }

  async deleteResume(filename) {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filename]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Resume delete error:', error);
      throw new Error(`Resume delete failed: ${error.message}`);
    }
  }

  async getResumeUrl(filename) {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      const { data } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filename);

      return data.publicUrl;
    } catch (error) {
      console.error('Get URL error:', error);
      throw new Error(`Get URL failed: ${error.message}`);
    }
  }

  getMimeType(fileExtension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    return mimeTypes[fileExtension.toLowerCase()] || 'application/octet-stream';
  }

  validateFileType(filename) {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt']; // Added .txt for testing
    const fileExtension = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(fileExtension);
  }

  validateFileSize(fileSize) {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default
    return fileSize <= maxSize;
  }
}

module.exports = new SupabaseStorageService();