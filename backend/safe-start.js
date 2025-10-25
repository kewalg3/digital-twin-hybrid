#!/usr/bin/env node

// Safe startup script with detailed error logging
console.log('🚀 Digital Twin Backend - Safe Startup Script');
console.log('===============================================\n');

// Add uncaught exception handlers for better debugging
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// Step-by-step startup with error catching
async function safeStartup() {
  try {
    console.log('1️⃣ Loading environment configuration...');
    const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
    require('dotenv').config({ path: envFile });
    console.log(`   ✅ Environment loaded from ${envFile}`);

    console.log('\n2️⃣ Loading core dependencies...');
    const express = require('express');
    const cors = require('cors');
    const helmet = require('helmet');
    const morgan = require('morgan');
    const compression = require('compression');
    const rateLimit = require('express-rate-limit');
    const fileUpload = require('express-fileupload');
    const { createServer } = require('http');
    console.log('   ✅ Core dependencies loaded');

    console.log('\n3️⃣ Initializing Prisma...');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    console.log('   ✅ Prisma client created');

    console.log('\n4️⃣ Loading middleware...');
    const errorHandler = require('./src/middleware/errorHandler');
    const authMiddleware = require('./src/middleware/auth');
    console.log('   ✅ Middleware loaded');

    console.log('\n5️⃣ Loading route modules...');
    const authRoutes = require('./src/routes/auth');
    const resumeRoutes = require('./src/routes/resumes');
    const interviewRoutes = require('./src/routes/interviews');
    const conversationRoutes = require('./src/routes/conversations');
    const interviewAPIRoutes = require('./src/routes/interview');
    const eviInterviewRoutes = require('./src/routes/eviInterviews');
    const onboardingRoutes = require('./src/routes/onboarding');
    const userRoutes = require('./src/routes/users');
    const experienceRoutes = require('./src/routes/experiences');
    const skillRoutes = require('./src/routes/skills');
    const skillsetRoutes = require('./src/routes/skillsets');
    const softwareRoutes = require('./src/routes/software');
    const autocompleteRoutes = require('./src/routes/autocomplete');
    console.log('   ✅ All route modules loaded');

    console.log('\n6️⃣ Testing database connection...');
    await prisma.$connect();
    console.log('   ✅ Database connection successful');

    console.log('\n7️⃣ Setting up Express application...');
    const app = express();
    const server = createServer(app);

    // Middleware setup
    app.use(helmet());
    app.use(compression());
    app.use(morgan('combined'));

    // CORS configuration
    const corsOptions = {
      origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        const allowedOrigins = [
          "http://localhost:8080",
          "http://localhost:8081",
          "http://localhost:3000",
          "http://localhost:5173",
          process.env.FRONTEND_URL || "http://localhost:8080"
        ];
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    };
    app.use(cors(corsOptions));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
      message: 'Too many requests from this IP, please try again later.',
      skip: (req) => {
        return req.path === '/api/resumes/upload' ||
               req.path.startsWith('/api/auth/') ||
               process.env.NODE_ENV === 'development';
      }
    });
    app.use('/api/', limiter);

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // File upload
    app.use(fileUpload({
      createParentPath: true,
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024
      },
      abortOnLimit: true
    }));

    // Health check
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      });
    });

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/resumes', authMiddleware, resumeRoutes);
    app.use('/api/interviews', authMiddleware, interviewRoutes);
    app.use('/api/conversations', authMiddleware, conversationRoutes);
    app.use('/api/interview', interviewAPIRoutes);
    app.use('/api/evi-interviews', eviInterviewRoutes);
    app.use('/api/onboarding', onboardingRoutes);
    app.use('/api/users', (req, res, next) => {
      if (req.path.startsWith('/profile/')) {
        return next();
      }
      authMiddleware(req, res, next);
    }, userRoutes);
    app.use('/api/experiences', experienceRoutes);
    app.use('/api/skills', authMiddleware, skillRoutes);
    app.use('/api/skillsets', skillsetRoutes);
    app.use('/api/software', softwareRoutes);
    app.use('/api/autocomplete', autocompleteRoutes);

    // Error handling
    app.use(errorHandler);

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
      });
    });

    console.log('   ✅ Express application configured');

    console.log('\n8️⃣ Starting server...');
    const PORT = process.env.PORT || 3001;

    server.listen(PORT, '0.0.0.0', () => {
      console.log('\n🎉 SERVER STARTED SUCCESSFULLY!');
      console.log('================================');
      console.log(`🚀 Digital Twin Backend running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Server accessible at: http://localhost:${PORT}`);
      console.log('\n✅ Ready to accept connections!');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    async function gracefulShutdown(signal) {
      console.log(`\n${signal} received, starting graceful shutdown...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });
    }

  } catch (error) {
    console.error('\n💥 STARTUP FAILED!');
    console.error('==================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('\nThis error occurred during server startup.');
    console.error('Please check the error message above and fix the issue.');
    process.exit(1);
  }
}

// Start the application
safeStartup();