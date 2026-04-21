#!/bin/sh

echo "Generating Prisma client..."
cd /app/backend
npx prisma generate

echo "Syncing database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "db push warning (continuing)"

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
" || echo "Admin seed skipped"

echo "Seeding budget forecast..."
cd /app
npx tsx backend/src/scripts/seedBudgetForecast.ts || echo "Budget seed skipped"

echo "Starting Nginx..."
nginx

echo "Starting Backend..."
exec npx tsx backend/src/index.ts
