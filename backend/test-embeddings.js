const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEmbeddings() {
  const userId = 'cmgkd61po00024p8bqj86qf2g';

  // Check if embeddings actually exist
  const result = await prisma.$queryRaw`
    SELECT
      id,
      user_id,
      source_type,
      SUBSTRING(chunk_text, 1, 100) as text_preview,
      embedding IS NOT NULL as has_embedding,
      pg_column_size(embedding) as embedding_size
    FROM user_context_chunks
    WHERE user_id = ${userId}
    LIMIT 5
  `;

  console.log('Embedding check for Jonathan Keane:');
  result.forEach(r => {
    console.log(`\n${r.source_type}:`);
    console.log(`  Text: ${r.text_preview}...`);
    console.log(`  Has embedding: ${r.has_embedding}`);
    console.log(`  Embedding size: ${r.embedding_size} bytes`);
  });

  await prisma.$disconnect();
}

testEmbeddings().catch(console.error);