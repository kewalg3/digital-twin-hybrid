const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: 'cmfznf7np0000hfo3d6tqk3va'
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true
      }
    });

    if (user) {
      console.log('✅ User found:');
      console.log('ID:', user.id);
      console.log('Email:', user.email);
      console.log('Name:', user.fullName);
      console.log('Has password:', !!user.passwordHash);
      console.log('Password hash length:', user.passwordHash?.length || 0);
    } else {
      console.log('❌ User not found');
    }

    // Also check by email
    const userByEmail = await prisma.user.findUnique({
      where: {
        email: 'kewalgosrani@gmail.com'
      },
      select: {
        id: true,
        email: true,
        fullName: true
      }
    });

    if (userByEmail) {
      console.log('✅ User found by email:');
      console.log('ID:', userByEmail.id);
      console.log('Email:', userByEmail.email);
      console.log('Name:', userByEmail.fullName);
    } else {
      console.log('❌ User not found by email');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();