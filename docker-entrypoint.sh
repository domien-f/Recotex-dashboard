#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/backend

# First deploy: baseline existing migrations if _prisma_migrations table doesn't exist yet
if ! npx prisma migrate deploy 2>/dev/null; then
  echo "First migration run — baselining existing migrations..."
  npx prisma migrate resolve --applied 20260318154840_init
  npx prisma migrate resolve --applied 20260324130637_add_integration_credentials
  npx prisma migrate deploy
fi

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
