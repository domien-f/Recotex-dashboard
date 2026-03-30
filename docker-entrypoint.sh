#!/bin/sh
set -e

echo "Syncing database schema..."
cd /app/backend
npx prisma db push --accept-data-loss

echo "Seeding admin user..."
npx tsx -e "
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function seed() {
  const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!existing) {
    const hash = await bcrypt.hash('admin123', 12);
    await prisma.user.create({ data: { email: 'admin@dashboard.local', passwordHash: hash, name: 'Admin', role: 'ADMIN' } });
    console.log('Admin user created: admin@dashboard.local / admin123');
  } else {
    console.log('Admin user already exists:', existing.email);
  }
  await prisma.\$disconnect();
}
seed();
"

echo "Starting Nginx..."
nginx

echo "Starting Backend..."
cd /app
npx tsx backend/src/index.ts
