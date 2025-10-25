const { PrismaClient } = require('@prisma/client');
const { generateEmbeddings } = require('./src/services/embeddingService');

const prisma = new PrismaClient();

async function testSearch() {
  const userId = 'cmgkd61po00024p8bqj86qf2g';
  const query = 'Tell me about your recent work experience';

  console.log(`Testing search for user: ${userId}`);
  console.log(`Query: "${query}"\n`);

  // 1. Generate embedding for query
  console.log('Generating query embedding...');
  const queryEmbeddings = await generateEmbeddings([query]);
  const queryEmbedding = queryEmbeddings[0];
  console.log(`Query embedding generated (${queryEmbedding.length} dimensions)\n`);

  // 2. Format as PostgreSQL vector
  const embeddingVector = `[${queryEmbedding.join(',')}]`;

  // 3. Try with NO threshold first
  console.log('Testing without threshold...');
  const allResults = await prisma.$queryRaw`
    SELECT
      id,
      user_id,
      source_type,
      SUBSTRING(chunk_text, 1, 150) as text_preview,
      1 - (embedding <=> ${embeddingVector}::vector) AS similarity
    FROM user_context_chunks
    WHERE user_id = ${userId}
    ORDER BY embedding <=> ${embeddingVector}::vector
    LIMIT 5
  `;

  console.log(`\nAll results (no threshold):`);
  allResults.forEach((r, i) => {
    console.log(`${i + 1}. [${r.source_type}] Similarity: ${r.similarity.toFixed(4)}`);
    console.log(`   Text: ${r.text_preview.substring(0, 100)}...`);
  });

  // 4. Try with threshold
  console.log('\n\nTesting with threshold 0.5...');
  const thresholdResults = await prisma.$queryRaw`
    SELECT
      id,
      source_type,
      SUBSTRING(chunk_text, 1, 150) as text_preview,
      1 - (embedding <=> ${embeddingVector}::vector) AS similarity
    FROM user_context_chunks
    WHERE user_id = ${userId}
      AND 1 - (embedding <=> ${embeddingVector}::vector) > 0.5
    ORDER BY embedding <=> ${embeddingVector}::vector
    LIMIT 5
  `;

  console.log(`Results with threshold 0.5: ${thresholdResults.length}`);

  await prisma.$disconnect();
}

testSearch().catch(console.error);