const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createKewalsTestUser() {
  try {
    console.log('Creating test user for Kewal with ID: cmfznf7np0000hfo3d6tqk3va');

    // Hash password for 'password123'
    const passwordHash = await bcrypt.hash('password123', 12);

    // Create the test user with specific ID
    const user = await prisma.user.create({
      data: {
        id: 'cmfznf7np0000hfo3d6tqk3va',
        fullName: 'Kewal Gosrani',
        firstName: 'Kewal',
        lastName: 'Gosrani',
        email: 'kewalgosrani@gmail.com',
        passwordHash,
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        profileComplete: true
      }
    });

    console.log('✅ Created user:', user.fullName);

    // Create test experience
    const experience = await prisma.experience.create({
      data: {
        userId: user.id,
        company: 'Tech Corp',
        jobTitle: 'Senior Software Engineer',
        startDate: new Date('2022-01-01'),
        endDate: null,
        isCurrentRole: true,
        location: 'San Francisco, CA',
        keySkills: ['JavaScript', 'React', 'Node.js', 'Python'],
        achievements: [
          'Led development of voice interview platform',
          'Implemented LiveKit integration for real-time communication',
          'Built scalable backend architecture with Node.js and PostgreSQL'
        ]
      }
    });

    console.log('✅ Created experience at:', experience.company);

    // Create test resume
    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        fileName: 'kewal_resume.pdf',
        originalFilename: 'kewal_resume.pdf',
        extractedName: 'Kewal Gosrani',
        skillsExtracted: ['JavaScript', 'React', 'Node.js', 'Python', 'PostgreSQL', 'LiveKit'],
        totalExperience: '5+ years',
        professionalSummary: 'Experienced software engineer specializing in full-stack development and real-time communication systems.',
        parsedContent: 'Full resume content would be here...'
      }
    });

    console.log('✅ Created resume for:', resume.extractedName);
    console.log('✅ Test user setup complete!');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Password: password123');

  } catch (error) {
    if (error.code === 'P2002') {
      console.log('✅ User already exists with that ID or email');
    } else {
      console.error('❌ Error creating test user:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createKewalsTestUser();