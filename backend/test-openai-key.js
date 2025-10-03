const OpenAI = require('openai');
require('dotenv').config({ path: '.env.development' });

async function testOpenAIKey() {
  console.log('🔑 Testing OpenAI API Key...');
  console.log('Key starts with:', process.env.OPENAI_API_KEY?.substring(0, 20) + '...');
  console.log('Key length:', process.env.OPENAI_API_KEY?.length);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Say 'API key is working!'"
        }
      ],
      max_tokens: 10
    });

    console.log('✅ OpenAI API Key is valid!');
    console.log('Response:', response.choices[0].message.content);
  } catch (error) {
    console.error('❌ OpenAI API Key test failed:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    if (error.status) {
      console.error('Status code:', error.status);
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
  }
}

testOpenAIKey();