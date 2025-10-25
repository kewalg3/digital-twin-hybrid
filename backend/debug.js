// Debug script to identify the startup issue
console.log('Debug: Starting...');

try {
  console.log('Debug: Loading environment...');
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
  require('dotenv').config({ path: envFile });
  console.log(`Debug: Environment loaded from ${envFile}`);

  console.log('Debug: Loading Prisma...');
  const { PrismaClient } = require('@prisma/client');
  console.log('Debug: Prisma loaded successfully');

  console.log('Debug: Creating Prisma instance...');
  const prisma = new PrismaClient();
  console.log('Debug: Prisma instance created');

  console.log('Debug: Loading express...');
  const express = require('express');
  console.log('Debug: Express loaded');

  console.log('Debug: Loading middleware modules...');
  const cors = require('cors');
  const helmet = require('helmet');
  const morgan = require('morgan');
  const compression = require('compression');
  const rateLimit = require('express-rate-limit');
  const fileUpload = require('express-fileupload');
  const { createServer } = require('http');
  console.log('Debug: Middleware modules loaded');

  console.log('Debug: Loading routes...');
  const authRoutes = require('./src/routes/auth');
  console.log('Debug: Auth routes loaded');

  const resumeRoutes = require('./src/routes/resumes');
  console.log('Debug: Resume routes loaded');

  const interviewRoutes = require('./src/routes/interviews');
  console.log('Debug: Interview routes loaded');

  const conversationRoutes = require('./src/routes/conversations');
  console.log('Debug: Conversation routes loaded');

  const interviewAPIRoutes = require('./src/routes/interview');
  console.log('Debug: Interview API routes loaded');

  const eviInterviewRoutes = require('./src/routes/eviInterviews');
  console.log('Debug: EVI interview routes loaded');

  const onboardingRoutes = require('./src/routes/onboarding');
  console.log('Debug: Onboarding routes loaded');

  const userRoutes = require('./src/routes/users');
  console.log('Debug: User routes loaded');

  const experienceRoutes = require('./src/routes/experiences');
  console.log('Debug: Experience routes loaded');

  const skillRoutes = require('./src/routes/skills');
  console.log('Debug: Skill routes loaded');

  const skillsetRoutes = require('./src/routes/skillsets');
  console.log('Debug: Skillset routes loaded');

  const softwareRoutes = require('./src/routes/software');
  console.log('Debug: Software routes loaded');

  const autocompleteRoutes = require('./src/routes/autocomplete');
  console.log('Debug: Autocomplete routes loaded');

  console.log('Debug: Loading middleware files...');
  const errorHandler = require('./src/middleware/errorHandler');
  console.log('Debug: Error handler loaded');

  const authMiddleware = require('./src/middleware/auth');
  console.log('Debug: Auth middleware loaded');

  console.log('Debug: All modules loaded successfully!');

  // Test database connection
  console.log('Debug: Testing database connection...');
  prisma.$connect().then(() => {
    console.log('Debug: Database connection successful!');
    process.exit(0);
  }).catch((error) => {
    console.error('Debug: Database connection failed:', error);
    process.exit(1);
  });

} catch (error) {
  console.error('Debug: Error during startup:', error);
  process.exit(1);
}