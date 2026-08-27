import 'dotenv/config';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
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

async function upsertServiceRequest(data: {
  tableId: string;
  tableSessionId?: string;
  type: ServiceRequestType;
  status?: ServiceRequestStatus;
}) {
  const existing = await prisma.serviceRequest.findFirst({
    where: {
      tableId: data.tableId,
      tableSessionId: data.tableSessionId,
      type: data.type,
    },
  });

  if (existing) {
    return prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: data.status ?? ServiceRequestStatus.PENDING,
        resolvedAt:
          data.status === ServiceRequestStatus.RESOLVED ? new Date() : null,
      },
    });
  }

  return prisma.serviceRequest.create({
    data: {
      tableId: data.tableId,
      tableSessionId: data.tableSessionId,
      type: data.type,
      status: data.status ?? ServiceRequestStatus.PENDING,
      resolvedAt:
        data.status === ServiceRequestStatus.RESOLVED ? new Date() : undefined,
    },
  });
}

async function upsertDemoOrder(params: {
  tableId: string;
  tableSessionId: string;
  status: OrderStatus;
  items: {
    menuItemId: string;
    quantity: number;
    unitPrice: number;
    note?: string;
  }[];
}) {
  const existing = await prisma.order.findFirst({
    where: { tableSessionId: params.tableSessionId, status: params.status },
  });
  if (existing) return existing;

  return prisma.order.create({
    data: {
      tableId: params.tableId,
      tableSessionId: params.tableSessionId,
      status: params.status,
      items: { create: params.items },
    },
  });
}

async function createReceiptForSession(tableSessionId: string) {
  const existingReceipt = await prisma.receipt.findUnique({
    where: { tableSessionId },
  });
  if (existingReceipt) return existingReceipt;

  const session = await prisma.tableSession.findUnique({
    where: { id: tableSessionId },
    include: {
      table: true,
      payment: true,
      orders: {
        include: {
          items: {
            include: {
              menuItem: true,
              selectedOptions: true,
            },
          },
        },
      },
    },
  });

  if (!session?.payment) return null;

  const items = session.orders.flatMap((order) =>
    order.items.map((item) => {
      const optionTotal = item.selectedOptions.reduce(
        (sum, option) => sum.plus(option.price),
        new Prisma.Decimal(0),
      );
      const lineTotal = item.unitPrice.plus(optionTotal).mul(item.quantity);

      return {
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        optionTotal,
        lineTotal,
        note: item.note,
        orderId: order.id,
      };
    }),
  );

  const subtotal = items.reduce(
    (sum, item) => sum.plus(item.lineTotal),
    new Prisma.Decimal(0),
  );

  return prisma.receipt.create({
    data: {
      number: `RCPT-${Date.now()}`,
      paymentId: session.payment.id,
      tableId: session.tableId,
      tableSessionId: session.id,
      subtotal,
      discount: 0,
      total: session.payment.amount,
      items: { create: items },
    },
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

  const demoPaidSession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-1-paid-session' },
    update: {
      tableId: tables[0].id,
      status: TableSessionStatus.CLOSED,
      closedAt: new Date(),
      expiresAt: null,
    },
    create: {
      tableId: tables[0].id,
      token: 'demo-table-1-paid-session',
      status: TableSessionStatus.CLOSED,
      closedAt: new Date(),
    },
  });

  const existingPaidDemoOrder = await prisma.order.findFirst({
    where: { tableSessionId: demoPaidSession.id },
  });

  if (!existingPaidDemoOrder) {
    await prisma.order.create({
      data: {
        tableId: tables[0].id,
        tableSessionId: demoPaidSession.id,
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
  }

  await prisma.payment.upsert({
    where: { tableSessionId: demoPaidSession.id },
    update: { amount: 70, method: PaymentMethod.CASH },
    create: {
      tableSessionId: demoPaidSession.id,
      amount: 70,
      method: PaymentMethod.CASH,
    },
  });

  await Promise.all([
    upsertServiceRequest({
      tableId: tables[1].id,
      tableSessionId: demoSession.id,
      type: ServiceRequestType.CALL_STAFF,
    }),
    upsertServiceRequest({
      tableId: tables[1].id,
      tableSessionId: demoSession.id,
      type: ServiceRequestType.CHECKOUT,
    }),
  ]);

  // Give the open demo session (table 2) one order in each kitchen-board
  // status, so the queue / preparing / served columns all have data.
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.PENDING,
    items: [{ menuItemId: gaprao.id, quantity: 1, unitPrice: 50, note: 'เผ็ดน้อย' }],
  });
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.PREPARING,
    items: [{ menuItemId: friedRice.id, quantity: 2, unitPrice: 50 }],
  });
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.SERVED,
    items: [{ menuItemId: water.id, quantity: 2, unitPrice: 10 }],
  });

  // A second open session (table 4) whose orders are all SERVED, so the
  // Check/checkout screen has a table that's actually ready to pay.
  const demoReadySession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-4-ready-session' },
    update: {
      tableId: tables[3].id,
      status: TableSessionStatus.OPEN,
      closedAt: null,
    },
    create: {
      tableId: tables[3].id,
      token: 'demo-table-4-ready-session',
      status: TableSessionStatus.OPEN,
    },
  });
  await prisma.restaurantTable.update({
    where: { id: tables[3].id },
    data: { status: TableStatus.OCCUPIED },
  });
  await upsertDemoOrder({
    tableId: tables[3].id,
    tableSessionId: demoReadySession.id,
    status: OrderStatus.SERVED,
    items: [
      { menuItemId: padSeeEw.id, quantity: 1, unitPrice: 50 },
      { menuItemId: water.id, quantity: 2, unitPrice: 10 },
    ],
  });

  await createReceiptForSession(demoPaidSession.id);

  console.log('Seed completed');
  console.table([
    { role: admin.role, email: admin.email, password: seedPassword },
    { role: Role.WAITER, email: 'waiter@restaurant.local', password: seedPassword },
    { role: Role.KITCHEN, email: 'kitchen@restaurant.local', password: seedPassword },
    { role: Role.CASHIER, email: 'cashier@restaurant.local', password: seedPassword },
  ]);
  console.log('Created sample categories, menu items, menu options, tables, QR sessions (open with mixed-status orders, open ready-to-pay, and closed/paid), service requests, and a receipt for a paid order.');
  console.log(`Demo QR session token (table 2, PENDING/PREPARING/SERVED orders): ${demoSession.token}`);
  console.log(`Demo ready-to-pay session token (table 4, all SERVED): ${demoReadySession.token}`);
  console.log(`Demo paid session token (table 1, closed): ${demoPaidSession.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
