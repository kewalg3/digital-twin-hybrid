const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');
const { createServer } = require('http');
// Removed Socket.IO - using direct Hume WebSocket instead
// Load environment-specific .env file
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });
console.log(`🔧 Loaded environment: ${process.env.NODE_ENV || 'development'} from ${envFile}`);


const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resumes');
const interviewRoutes = require('./routes/interviews');
const conversationRoutes = require('./routes/conversations');
// Removed: Legacy voice routes (voiceRoutes, voiceInterviewRoutes) - disabled by feature flags
// const eviInterviewRoutes = require('./routes/eviInterview'); // REMOVED: Old proxy approach
const eviConfigOnlyRoutes = require('./routes/eviConfigOnly');
const eviInterviewRoutes = require('./routes/eviInterviews');
const onboardingRoutes = require('./routes/onboarding');
const userRoutes = require('./routes/users');
const experienceRoutes = require('./routes/experiences');
const skillRoutes = require('./routes/skills');
const skillsetRoutes = require('./routes/skillsets');
const softwareRoutes = require('./routes/software');
const autocompleteRoutes = require('./routes/autocomplete');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = createServer(app);

// Removed Socket.IO initialization - using direct Hume WebSocket API calls instead

const prisma = new PrismaClient();

// Global middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// CORS configuration - More flexible for development
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like from file:// or Postman)
    if (!origin) return callback(null, true);

    // List of allowed origins
    const allowedOrigins = [
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:3000",
      "http://localhost:5173",
      process.env.FRONTEND_URL || "http://localhost:8080"
    ];

    // Check if origin is allowed
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// General rate limiting - TEMPORARILY INCREASED FOR DEVELOPMENT
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // INCREASED: 1000 requests per window for development
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for resume upload and auth endpoints during development
    return req.path === '/api/resumes/upload' || 
           req.path.startsWith('/api/auth/') || 
           process.env.NODE_ENV === 'development';
  }
});

// Updated rate limiting for voice/audio endpoints (buffered audio)
const voiceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 120, // INCREASED: Max 120 requests per minute (1 every 0.5 seconds) for buffered audio
  message: 'Too many audio requests, please try again later.',
  skipSuccessfulRequests: true // Only count failed requests
});

// Apply general limiter to all API routes
app.use('/api/', limiter);

// Apply stricter limiter to voice-specific endpoints
app.use('/api/voice-interview/audio', voiceLimiter);
app.use('/api/evi-interview/audio', voiceLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload middleware
app.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  abortOnLimit: true
}));

// Health check endpoint with detailed status
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: `${Math.floor(uptime / 60)} minutes`,
    memory: {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`
    },
    activeSessions: {
      // Will be populated by individual services
      voice: 0
    }
  });
});


// API routes
app.use('/api/auth', authRoutes);
app.use('/api/resumes', authMiddleware, resumeRoutes);
app.use('/api/interviews', authMiddleware, interviewRoutes);
app.use('/api/conversations', authMiddleware, conversationRoutes);
// EVI interviews are enabled by default
app.use('/api/evi-interview', eviConfigOnlyRoutes); // Config-only backend, frontend connects directly to Hume
app.use('/api/evi-interviews', eviInterviewRoutes); // NEW: EVI interview completion processing
app.use('/api/onboarding', onboardingRoutes); // NEW: Unified onboarding API
// Apply auth middleware selectively for user routes
app.use('/api/users', (req, res, next) => {
  // Skip auth for public profile endpoint
  if (req.path.startsWith('/profile/')) {
    return next();
  }
  // Apply auth middleware for all other user routes
  authMiddleware(req, res, next);
}, userRoutes);
app.use('/api/experiences', experienceRoutes); // No auth for testing
app.use('/api/skills', authMiddleware, skillRoutes);
app.use('/api/skillsets', skillsetRoutes); // No auth for testing
app.use('/api/software', softwareRoutes); // No auth for testing
app.use('/api/autocomplete', autocompleteRoutes); // No auth for autocomplete

// Socket.IO WebSocket handling removed - using direct Hume WebSocket API calls instead
// Voice interviews now handled via REST API endpoints in /api/voice-interview/*

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Store server instance for graceful shutdown
let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`${signal} received, starting graceful shutdown...`);
  
  try {
    // Set a timeout for forceful shutdown if graceful shutdown takes too long
    const shutdownTimeout = setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout
    
    // 1. Stop accepting new connections
    console.log('🔒 Stopping server from accepting new connections...');
    server.close(async () => {
      try {
        // 2. Cleanup active EVI sessions
        console.log('🧹 Cleaning up active EVI sessions...');
        
        // EVI cleanup no longer needed - frontend manages direct connections
        console.log('✅ EVI cleanup skipped - using direct connections')
        
        // 3. Close database connections
        console.log('🗄️ Disconnecting from database...');
        await prisma.$disconnect();
        
        // 4. Clear shutdown timeout
        clearTimeout(shutdownTimeout);
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
        
      } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    });
    
    // If server.close() callback doesn't run within timeout, force shutdown
    setTimeout(() => {
      console.error('Server close callback did not execute, forcing shutdown');
      process.exit(1);
    }, 25000); // 25 seconds - less than the main timeout
    
  } catch (error) {
    console.error('❌ Error initiating graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Digital Twin Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Server accessible at: http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});

module.exports = { app, server, prisma }; 
// Trigger restart

// Restart trigger
