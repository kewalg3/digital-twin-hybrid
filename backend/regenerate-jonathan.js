const { generateAllUserEmbeddings } = require('./src/services/embeddingService');

async function regenerateJonathan() {
  const userId = 'cmgkd61po00024p8bqj86qf2g';

  console.log(`🔄 Regenerating embeddings for Jonathan Keane - User: ${userId}`);

  try {
    const results = await generateAllUserEmbeddings(userId);

    // Count successful operations
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalOperations = Object.keys(results).length;

    console.log(`✅ Regenerated ${successCount}/${totalOperations} embedding types successfully`);
    console.log('\nDetailed results:');
    Object.entries(results).forEach(([type, result]) => {
      if (result.success) {
        console.log(`  ✅ ${type}: ${result.chunksCreated || 'N/A'} chunks`);
      } else {
        console.log(`  ❌ ${type}: ${result.message}`);
      }
    });

  } catch (error) {
    console.error('❌ Regeneration failed:', error);
  }
}

regenerateJonathan();