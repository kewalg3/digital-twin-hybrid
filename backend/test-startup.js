// Test startup script
const path = require('path');
const fs = require('fs');

console.log('Testing server startup...');
console.log('Current directory:', process.cwd());

// Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('ERROR: package.json not found in current directory');
  process.exit(1);
}

// Check if node_modules exists
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('ERROR: node_modules directory not found. Run npm install first.');
  process.exit(1);
}

console.log('✅ package.json found');
console.log('✅ node_modules found');

// Test loading dependencies one by one
const dependencies = [
  'express',
  'cors',
  'helmet',
  'morgan',
  'compression',
  'express-rate-limit',
  'express-fileupload',
  'http',
  'dotenv',
  '@prisma/client'
];

console.log('\nTesting dependencies...');
for (const dep of dependencies) {
  try {
    require(dep);
    console.log(`✅ ${dep}`);
  } catch (error) {
    console.error(`❌ ${dep}: ${error.message}`);
    process.exit(1);
  }
}

// Test loading project files
const projectFiles = [
  './src/routes/auth',
  './src/routes/resumes',
  './src/routes/interviews',
  './src/routes/conversations',
  './src/routes/interview',
  './src/routes/eviInterviews',
  './src/routes/onboarding',
  './src/routes/users',
  './src/routes/experiences',
  './src/routes/skills',
  './src/routes/skillsets',
  './src/routes/software',
  './src/routes/autocomplete',
  './src/middleware/errorHandler',
  './src/middleware/auth'
];

console.log('\nTesting project files...');
for (const file of projectFiles) {
  try {
    require(file);
    console.log(`✅ ${file}`);
  } catch (error) {
    console.error(`❌ ${file}: ${error.message}`);
    process.exit(1);
  }
}

console.log('\n✅ All dependencies and files loaded successfully!');

// Test environment loading
console.log('\nTesting environment...');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
try {
  require('dotenv').config({ path: envFile });
  console.log(`✅ Environment loaded from ${envFile}`);
} catch (error) {
  console.error(`❌ Error loading environment: ${error.message}`);
  process.exit(1);
}

// Test database connection
console.log('\nTesting database connection...');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.$connect()
  .then(() => {
    console.log('✅ Database connection successful!');
    return prisma.$disconnect();
  })
  .then(() => {
    console.log('✅ Database disconnection successful!');
    console.log('\n🎉 All tests passed! Server should start successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`❌ Database connection failed: ${error.message}`);
    process.exit(1);
  });