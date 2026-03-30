import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const passwordHash = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@dashboard.local" },
    update: {},
    create: {
      email: "admin@dashboard.local",
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });

  console.log("Seed completed: admin@dashboard.local / admin123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
