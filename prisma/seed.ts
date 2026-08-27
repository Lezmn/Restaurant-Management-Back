import 'dotenv/config';
import {
  OrderStatus,
  PaymentMethod,
  PrismaClient,
  Role,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const seedPassword = 'ChangeMe123!';

async function upsertUser(email: string, name: string, role: Role) {
  const password = await bcrypt.hash(seedPassword, 12);

  return prisma.user.upsert({
    where: { email },
    update: { name, role, password },
    create: { email, name, role, password },
  });
}

async function upsertCategory(name: string) {
  return prisma.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertMenuItem(data: {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
}) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      categoryId: data.categoryId,
      name: data.name,
    },
  });

  if (existing) {
    return prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        description: data.description,
        price: data.price,
        imageUrl: data.imageUrl,
        isAvailable: true,
      },
    });
  }

  return prisma.menuItem.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      description: data.description,
      price: data.price,
      imageUrl: data.imageUrl,
      isAvailable: true,
    },
  });
}

async function upsertMenuOption(menuItemId: string, name: string, price = 0) {
  const existing = await prisma.menuOption.findFirst({
    where: { menuItemId, name },
  });

  if (existing) {
    return prisma.menuOption.update({
      where: { id: existing.id },
      data: { price, isAvailable: true },
    });
  }

  return prisma.menuOption.create({
    data: { menuItemId, name, price, isAvailable: true },
  });
}

async function upsertTable(number: number, seats = 4) {
  return prisma.restaurantTable.upsert({
    where: { number },
    update: { seats, status: TableStatus.AVAILABLE },
    create: { number, seats, status: TableStatus.AVAILABLE },
  });
}

async function main() {
  const [admin] = await Promise.all([
    upsertUser('admin@restaurant.local', 'Admin', Role.ADMIN),
    upsertUser('waiter@restaurant.local', 'Waiter', Role.WAITER),
    upsertUser('kitchen@restaurant.local', 'Kitchen Staff', Role.KITCHEN),
    upsertUser('cashier@restaurant.local', 'Cashier', Role.CASHIER),
  ]);

  const [riceCategory, noodleCategory, drinkCategory] = await Promise.all([
    upsertCategory('อาหารจานเดียว'),
    upsertCategory('เมนูเส้น'),
    upsertCategory('เครื่องดื่ม'),
  ]);

  const [gaprao, omeletRice, friedRice, padSeeEw, water] = await Promise.all([
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวผัดกะเพรา',
      description: 'ข้าวราดผัดกะเพรา เลือกเนื้อสัตว์และท็อปปิ้งได้',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f',
    }),
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวไข่เจียว',
      description: 'ไข่เจียวร้อนๆ เสิร์ฟพร้อมข้าวสวย',
      price: 40,
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
    }),
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวผัด',
      description: 'ข้าวผัดหอมกระทะ เลือกเนื้อสัตว์ได้',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b',
    }),
    upsertMenuItem({
      categoryId: noodleCategory.id,
      name: 'ผัดซีอิ๊ว',
      description: 'เส้นใหญ่ผัดซีอิ๊ว เลือกเนื้อสัตว์ได้',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa',
    }),
    upsertMenuItem({
      categoryId: drinkCategory.id,
      name: 'น้ำเปล่า',
      description: 'น้ำดื่มขวด',
      price: 10,
      imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504',
    }),
  ]);

  const [gapraoPork, gapraoEgg] = await Promise.all([
    upsertMenuOption(gaprao.id, 'หมู', 0),
    upsertMenuOption(gaprao.id, 'ไก่', 0),
    upsertMenuOption(gaprao.id, 'หมูกรอบ', 10),
    upsertMenuOption(gaprao.id, 'กุ้ง', 20),
    upsertMenuOption(gaprao.id, 'ไข่ดาว', 10),
    upsertMenuOption(gaprao.id, 'ไข่เจียว', 10),
    upsertMenuOption(gaprao.id, 'พิเศษ', 10),
  ]);

  await Promise.all([
    upsertMenuOption(omeletRice.id, 'ไข่ 1 ฟอง', 0),
    upsertMenuOption(omeletRice.id, 'ไข่ 2 ฟอง', 10),
    upsertMenuOption(omeletRice.id, 'หมูสับ', 10),
    upsertMenuOption(friedRice.id, 'หมู', 0),
    upsertMenuOption(friedRice.id, 'ไก่', 0),
    upsertMenuOption(friedRice.id, 'กุ้ง', 20),
    upsertMenuOption(friedRice.id, 'ไข่ดาว', 10),
    upsertMenuOption(friedRice.id, 'พิเศษ', 10),
    upsertMenuOption(padSeeEw.id, 'หมู', 0),
    upsertMenuOption(padSeeEw.id, 'ไก่', 0),
    upsertMenuOption(padSeeEw.id, 'กุ้ง', 20),
    upsertMenuOption(padSeeEw.id, 'พิเศษ', 10),
  ]);

  const tables = await Promise.all([
    upsertTable(1, 4),
    upsertTable(2, 4),
    upsertTable(3, 2),
    upsertTable(4, 6),
    upsertTable(5, 4),
    upsertTable(6, 8),
  ]);

  const demoSession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-2-session' },
    update: {
      tableId: tables[1].id,
      status: TableSessionStatus.OPEN,
      closedAt: null,
      expiresAt: null,
    },
    create: {
      tableId: tables[1].id,
      token: 'demo-table-2-session',
      status: TableSessionStatus.OPEN,
    },
  });
  await prisma.restaurantTable.update({
    where: { id: tables[1].id },
    data: { status: TableStatus.OCCUPIED },
  });

  const orderCount = await prisma.order.count();
  if (orderCount === 0) {
    const demoOrder = await prisma.order.create({
      data: {
        tableId: tables[0].id,
        status: OrderStatus.PAID,
        items: {
          create: [
            {
              menuItemId: gaprao.id,
              quantity: 1,
              unitPrice: 50,
              note: 'ไม่เผ็ด',
              selectedOptions: {
                create: [
                  {
                    menuOptionId: gapraoPork.id,
                    name: gapraoPork.name,
                    price: gapraoPork.price,
                  },
                  {
                    menuOptionId: gapraoEgg.id,
                    name: gapraoEgg.name,
                    price: gapraoEgg.price,
                  },
                ],
              },
            },
            {
              menuItemId: water.id,
              quantity: 1,
              unitPrice: 10,
            },
          ],
        },
      },
    });

    await prisma.payment.create({
      data: {
        orderId: demoOrder.id,
        amount: 70,
        method: PaymentMethod.CASH,
      },
    });
  }

  console.log('Seed completed');
  console.table([
    { role: admin.role, email: admin.email, password: seedPassword },
    { role: Role.WAITER, email: 'waiter@restaurant.local', password: seedPassword },
    { role: Role.KITCHEN, email: 'kitchen@restaurant.local', password: seedPassword },
    { role: Role.CASHIER, email: 'cashier@restaurant.local', password: seedPassword },
  ]);
  console.log('Created sample categories, menu items, menu options, tables, one active QR session, and one paid order if the database had no orders.');
  console.log(`Demo QR session token: ${demoSession.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
