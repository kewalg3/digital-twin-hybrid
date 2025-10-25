const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEmbeddings() {
  const userId = 'cmgkd61po00024p8bqj86qf2g';

  console.log(`\n🔍 Checking embeddings for user: ${userId}\n`);

  // Get all chunks for this user
  const chunks = await prisma.userContextChunk.findMany({
    where: { userId },
    select: {
      id: true,
      sourceType: true,
      chunkText: true,
      metadata: true
    }
  });

  console.log(`Found ${chunks.length} chunks:\n`);

  chunks.forEach((chunk, i) => {
    console.log(`\n--- Chunk ${i + 1} ---`);
    console.log(`Type: ${chunk.sourceType}`);
    console.log(`Text preview: ${chunk.chunkText.substring(0, 200)}...`);
    if (chunk.metadata) {
      console.log(`Metadata:`, JSON.stringify(chunk.metadata, null, 2));
    }
  });

  // Also check if Sarah Chen exists
  console.log(`\n\n🔍 Checking for Sarah Chen data:\n`);
  const sarahChunks = await prisma.$queryRaw`
    SELECT user_id, source_type, SUBSTRING(chunk_text, 1, 200) as text_preview
    FROM user_context_chunks
    WHERE chunk_text ILIKE '%Sarah Chen%'
       OR chunk_text ILIKE '%TechSolutions%'
    LIMIT 5
  `;

  if (sarahChunks.length > 0) {
    console.log('⚠️ Found Sarah Chen data:');
    sarahChunks.forEach(chunk => {
      console.log(`User: ${chunk.user_id}`);
      console.log(`Type: ${chunk.source_type}`);
      console.log(`Text: ${chunk.text_preview}\n`);
    });
  } else {
    console.log('✅ No Sarah Chen data found in database');
  }

  await prisma.$disconnect();
}

checkEmbeddings().catch(console.error);