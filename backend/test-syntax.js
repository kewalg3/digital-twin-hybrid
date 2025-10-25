// Simple test to check syntax
try {
  require('./src/routes/interview.js');
  console.log('✅ Syntax is OK');
} catch (error) {
  console.error('❌ Syntax error:', error.message);
}