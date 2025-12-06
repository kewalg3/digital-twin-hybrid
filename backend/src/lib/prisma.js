const { PrismaClient } = require('@prisma/client');

// Create a singleton instance of PrismaClient
// This prevents multiple instances from being created across different files
// which can cause prepared statement conflicts

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  // In development, use a global variable to preserve the client across hot reloads
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.prisma;
}

// Handle cleanup on app shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;