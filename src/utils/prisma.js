const { PrismaClient } = require('@prisma/client');

// Menyiapkan satu instance Prisma untuk seluruh aplikasi
const prisma = new PrismaClient();

module.exports = prisma;