const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authMiddleware = async (req, res, next) => {
  console.log('🔐 Auth middleware hit for:', req.method, req.path);
  console.log('🔐 Full URL:', req.originalUrl);
  console.log('🔐 Base URL:', req.baseUrl);
  console.log('🔐 Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
  
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No authorization header or invalid format');
      console.error('❌ Headers:', Object.keys(req.headers));
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('🔐 Token extracted, length:', token.length);

    // Verify token
    console.log('🔐 Verifying JWT token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 Token decoded successfully:', decoded.userId);
    
    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profileComplete: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Add user info to request
    req.user = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileCompleted: user.profileComplete || false
    };

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    console.error('❌ Error type:', error.name);
    console.error('❌ Full error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error during authentication'
    });
  }
};

module.exports = authMiddleware; 