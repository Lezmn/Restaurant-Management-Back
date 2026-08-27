import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  TableStatus,
  MenuItem,
  Prisma,
  TableSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemInputDto } from './dto/order-item-input.dto';

const ORDER_INCLUDE = {
  table: true,
  tableSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      expiresAt: true,
      tableId: true,
    },
  },
  items: { include: { menuItem: true, selectedOptions: { include: { menuOption: true } } } },
} as const;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: dto.tableId },
    });
    if (!table) {
      throw new NotFoundException(`ไม่พบโต๊ะ id: ${dto.tableId}`);
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: { options: true },
    });
    this.assertAllMenuItemsExistAndAvailable(dto.items, menuItems);

    // ใช้ transaction: สร้าง order + item ทั้งหมด และอัปเดตสถานะโต๊ะ
    // ต้องสำเร็จพร้อมกันทั้งหมด ถ้าล้มเหลวจุดใดจุดหนึ่งให้ rollback ทั้งหมด
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Claim the table atomically, preventing two open orders for one table.
      const claimedTable = await tx.restaurantTable.updateMany({
        where: { id: dto.tableId, status: TableStatus.AVAILABLE },
        data: { status: TableStatus.OCCUPIED },
      });
      if (claimedTable.count === 0) {
        throw new BadRequestException('โต๊ะนี้ไม่พร้อมรับออเดอร์ใหม่');
      }

      const order = await tx.order.create({
        data: {
          tableId: dto.tableId,
          items: { create: this.buildOrderItems(dto.items, menuItems) },
        },
        include: ORDER_INCLUDE,
      });

      return order;
    });
  }

  async createFromTableSession(sessionToken: string, items: OrderItemInputDto[]) {
    const session = await this.prisma.tableSession.findUnique({
      where: { token: sessionToken },
      include: { table: true },
    });
    if (!session) {
      throw new NotFoundException('ไม่พบ QR session นี้');
    }
    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('QR session นี้ปิดแล้ว');
    }
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.prisma.tableSession.update({
        where: { id: session.id },
        data: { status: TableSessionStatus.EXPIRED },
      });
      throw new BadRequestException('QR session นี้หมดอายุแล้ว');
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
      include: { options: true },
    });
    this.assertAllMenuItemsExistAndAvailable(items, menuItems);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return tx.order.create({
        data: {
          tableId: session.tableId,
          tableSessionId: session.id,
          items: { create: this.buildOrderItems(items, menuItems) },
        },
        include: ORDER_INCLUDE,
      });
    });
  }

  findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { status },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`ไม่พบออเดอร์ id: ${id}`);
    }
    return order;
  }

  /** ยอดรวมของออเดอร์ = sum(unitPrice * quantity) ของทุกรายการ */
  async getTotal(id: string) {
    const order = await this.findOne(id);
    const total = order.items.reduce((sum, item) => sum + this.calculateLineTotal(item), 0);
    return { orderId: id, total, itemCount: order.items.length };
  }

  async addItem(orderId: string, dto: OrderItemInputDto) {
    const order = await this.findOne(orderId);
    this.assertOrderIsEditable(order.status);

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
      include: { options: true },
    });
    if (!menuItem || !menuItem.isAvailable) {
      throw new BadRequestException('เมนูนี้ไม่พร้อมขายหรือไม่มีอยู่จริง');
    }

    await this.prisma.orderItem.create({
      data: {
        orderId,
        menuItemId: dto.menuItemId,
        quantity: dto.quantity,
        unitPrice: menuItem.price,
        note: dto.note,
        selectedOptions: { create: this.resolveSelectedOptions(dto, menuItem) },
      },
    });

    return this.findOne(orderId);
  }

  async removeItem(orderId: string, orderItemId: string) {
    const order = await this.findOne(orderId);
    this.assertOrderIsEditable(order.status);

    const item = order.items.find((i: { id: string }) => i.id === orderItemId);
    if (!item) {
      throw new NotFoundException(`ไม่พบรายการ id: ${orderItemId} ในออเดอร์นี้`);
    }

    await this.prisma.orderItem.delete({ where: { id: orderItemId } });
    return this.findOne(orderId);
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);
    this.assertValidTransition(order.status, status);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status },
        include: ORDER_INCLUDE,
      });

      // โต๊ะว่างอีกครั้งเมื่อออเดอร์ถูกยกเลิก; การจ่ายเงินใช้ PaymentsService.
      if (status === OrderStatus.CANCELLED) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: TableStatus.AVAILABLE },
        });
      }

      return updated;
    });
  }

  private assertAllMenuItemsExistAndAvailable(
    requested: OrderItemInputDto[],
    found: { id: string; isAvailable: boolean }[],
  ) {
    for (const item of requested) {
      const menuItem = found.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(`ไม่พบเมนู id: ${item.menuItemId}`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`เมนู id: ${item.menuItemId} ไม่พร้อมขายตอนนี้`);
      }
    }
  }

  /** ตรวจว่าตัวเลือกเป็นของเมนูนี้และยังพร้อมขาย */
  private resolveSelectedOptions(
    requested: OrderItemInputDto,
    menuItem: Prisma.MenuItemGetPayload<{
      include: { options: true };
    }>,
  ) {
    const selectedIds = requested.optionIds ?? [];
    const selected = selectedIds.map((id) => {
      const option = menuItem.options.find((candidate) => candidate.id === id);
      if (!option || !option.isAvailable) {
        throw new BadRequestException(`ตัวเลือก id: ${id} ไม่ถูกต้องหรือไม่พร้อมขาย`);
      }
      return option;
    });

    return selected.map((option) => ({
      menuOptionId: option.id,
      name: option.name,
      price: option.price,
    }));
  }

  private buildOrderItems(
    items: OrderItemInputDto[],
    menuItems: Prisma.MenuItemGetPayload<{ include: { options: true } }>[],
  ) {
    return items.map((item) => {
      const menuItem = menuItems.find(
        (m: MenuItem) => m.id === item.menuItemId,
      )!;
      const selectedOptions = this.resolveSelectedOptions(item, menuItem);
      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        note: item.note,
        selectedOptions: { create: selectedOptions },
      };
    });
  }

  private calculateLineTotal(item: {
    unitPrice: Prisma.Decimal;
    quantity: number;
    selectedOptions: { price: Prisma.Decimal }[];
  }) {
    const optionTotal = item.selectedOptions.reduce(
      (sum, option) => sum + Number(option.price),
      0,
    );
    return (Number(item.unitPrice) + optionTotal) * item.quantity;
  }

  private assertOrderIsEditable(status: OrderStatus) {
    if (status === OrderStatus.PAID || status === OrderStatus.CANCELLED) {
      throw new BadRequestException('ออเดอร์นี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้');
    }
  }

  /** กำหนดลำดับสถานะที่ถูกต้อง กัน bug เปลี่ยนสถานะข้ามขั้นหรือย้อนกลับมั่ว ๆ */
  private assertValidTransition(current: OrderStatus, next: OrderStatus) {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      PREPARING: [OrderStatus.SERVED, OrderStatus.CANCELLED],
      SERVED: [OrderStatus.CANCELLED],
      PAID: [],
      CANCELLED: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `ไม่สามารถเปลี่ยนสถานะจาก ${current} ไปเป็น ${next} ได้`,
      );
    }
  }
}
