#!/bin/sh
set -e

echo "Generating Prisma client..."
cd /app/backend
npx prisma generate

echo "Running database migrations..."

# Baseline existing migrations if this is the first time using migrate deploy
npx prisma migrate resolve --applied 20260318154840_init 2>/dev/null || true
npx prisma migrate resolve --applied 20260324130637_add_integration_credentials 2>/dev/null || true
npx prisma migrate deploy

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
