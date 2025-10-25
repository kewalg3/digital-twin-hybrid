#!/usr/bin/env node

// Start the backend server without nodemon to avoid restarts
console.log('🚀 Starting backend server (production mode to avoid restarts)...');

// Load environment
require('dotenv').config({ path: '.env.development' });

// Start the server directly
try {
  const app = require('./src/app.js');
  console.log('✅ Server started successfully without nodemon restarts');
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}