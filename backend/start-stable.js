#!/usr/bin/env node

// Start backend server in stable mode (no auto-restarts)
console.log('🚀 Starting stable backend server...');

process.env.NODE_ENV = 'development';
require('dotenv').config({ path: '.env.development' });

console.log('✅ Environment loaded');
console.log('🔧 Starting app...');

require('./src/app.js');