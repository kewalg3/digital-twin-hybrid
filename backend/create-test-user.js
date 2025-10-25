const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user with real experience data...');

    // Create a test user
    const user = await prisma.user.create({
      data: {
        id: 'test-user-001',
        fullName: 'Ryan M. Tlustosch',
        firstName: 'Ryan',
        lastName: 'Tlustosch',
        email: 'ryan@rlink.com',
        passwordHash: 'test-hash-123', // Dummy password hash for test
        city: 'San Francisco',
        state: 'CA',
        country: 'USA'
      }
    });

    console.log('✅ Created user:', user.fullName);

    // Create test experience
    const experience = await prisma.experience.create({
      data: {
        userId: user.id,
        company: 'R-Link',
        jobTitle: 'Founder and CEO',
        startDate: new Date('2025-01-19'),
        endDate: null,
        isCurrentRole: true,
        location: 'San Francisco, CA',
        keySkills: ['Product Development', 'Team Leadership', 'Strategy'],
        achievements: [
          'Founded innovative tech startup focused on digital transformation',
          'Built and led engineering team of multiple developers',
          'Developed core product architecture and go-to-market strategy'
        ]
      }
    });

    console.log('✅ Created experience at:', experience.company);

    // Create test resume
    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        fileName: 'ryan_resume.pdf',
        originalFilename: 'ryan_resume.pdf',
        extractedName: 'Ryan M. Tlustosch',
        skillsExtracted: ['JavaScript', 'Python', 'Product Management', 'Team Leadership', 'Strategy'],
        totalExperience: '5+ years',
        professionalSummary: 'Experienced technology leader and entrepreneur with a track record of building innovative products and leading high-performing teams.',
        parsedContent: 'Full resume content would be here...'
      }
    });

    console.log('✅ Created resume for:', resume.extractedName);
    console.log('✅ Test user setup complete!');
    console.log('User ID:', user.id);

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();