/**
 * Script to populate promptText field for existing experiences
 * Run this after applying the SQL migration to add the promptText column
 */

const { PrismaClient } = require('@prisma/client');
const { generatePromptText } = require('../src/utils/promptTextGenerator');

const prisma = new PrismaClient();

async function populatePromptText() {
  try {
    console.log('Starting to populate promptText for existing experiences...');

    // Get all experiences without promptText
    const experiences = await prisma.experience.findMany({
      where: {
        OR: [
          { promptText: null },
          { promptText: '' }
        ]
      }
    });

    console.log(`Found ${experiences.length} experiences to update`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const experience of experiences) {
      try {
        // Generate promptText for this experience
        const promptText = generatePromptText(experience);

        // Update the experience with promptText
        await prisma.experience.update({
          where: { id: experience.id },
          data: { promptText }
        });

        updatedCount++;
        console.log(`✓ Updated experience ${experience.id} - ${experience.jobTitle} at ${experience.company}`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Error updating experience ${experience.id}:`, error.message);
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total experiences: ${experiences.length}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
populatePromptText()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });