import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const category = await prisma.category.upsert({
    where: { name: 'อาหารจานเดียว' },
    update: {},
    create: { name: 'อาหารจานเดียว' },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        name: 'ผัดไทยกุ้งสด',
        price: 89,
        categoryId: category.id,
      },
      {
        name: 'ข้าวผัดปู',
        price: 79,
        categoryId: category.id,
      },
    ],
    skipDuplicates: true,
  });

  const table = await prisma.restaurantTable.upsert({
    where: { number: 1 },
    update: {},
    create: { number: 1, seats: 4 },
  });

  const adminPasswordHash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@restaurant.local' },
    update: { password: adminPasswordHash },
    create: {
      name: 'Admin',
      email: 'admin@restaurant.local',
      password: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  console.log('✅ Seed เสร็จแล้ว:', {
    category: category.name,
    table: table.number,
    adminEmail: 'admin@restaurant.local',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
