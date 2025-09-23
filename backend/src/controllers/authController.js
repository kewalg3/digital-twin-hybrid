const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AuthController {
  // Check authentication status
  async getStatus(req, res) {
    try {
      // Check if Authorization header exists
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({
          success: true,
          authenticated: false,
          user: null
        });
      }

      const token = authHeader.substring(7);

      try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            fullName: true,
            profileComplete: true,
            createdAt: true
          }
        });

        if (!user) {
          return res.json({
            success: true,
            authenticated: false,
            user: null
          });
        }

        return res.json({
          success: true,
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            profileCompleted: user.profileComplete,
            createdAt: user.createdAt
          }
        });

      } catch (tokenError) {
        // Invalid or expired token
        return res.json({
          success: true,
          authenticated: false,
          user: null
        });
      }

    } catch (error) {
      console.error('Auth status check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during status check'
      });
    }
  }

  // Register new user
  async register(req, res) {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists'
        });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user (User model only has email and passwordHash)
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash
        },
        select: {
          id: true,
          email: true,
          createdAt: true
        }
      });

      // Update user with additional fields if provided
      if (firstName || lastName || phone) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: firstName || null,
            lastName: lastName || null,
            fullName: (firstName && lastName) ? firstName + ' ' + lastName : null,
            phone: phone || null,
            profileComplete: false
          }
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user,
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during registration'
      });
    }
  }

  // Login user
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          fullName: true,
          phone: true,
          linkedinUrl: true,
          city: true,
          state: true,
          country: true,
          zipCode: true,
          address: true,
          profileComplete: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Format user response
      const userResponse = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        phone: user.phone,
        linkedinUrl: user.linkedinUrl,
        city: user.city,
        state: user.state,
        country: user.country,
        zipCode: user.zipCode,
        address: user.address,
        profileCompleted: user.profileComplete,
        createdAt: user.createdAt
      };

      res.json({
        success: true,
        message: 'Login successful',
        user: userResponse,
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during login'
      });
    }
  }

  // Get current user profile
  async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          profileCompleted: true,
          createdAt: true,
          updatedAt: true,
          resumes: {
            select: {
              id: true,
              originalFilename: true,
              createdAt: true
            }
          },
          voiceProfiles: {
            where: { isActive: true },
            select: {
              id: true,
              humeVoiceId: true,
              voiceName: true,
              voiceSettings: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({ 
        success: true,
        user 
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching profile'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const { firstName, lastName, phone } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone || undefined,
          profileCompleted: true
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          profileCompleted: true,
          updatedAt: true
        }
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while updating profile'
      });
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const userId = req.user.userId;
      const { currentPassword, newPassword } = req.body;

      // Get user with password hash
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while changing password'
      });
    }
  }
}

module.exports = new AuthController(); 