import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

const TABLE_SESSION_SELECT = {
  id: true,
  status: true,
  openedAt: true,
  closedAt: true,
  expiresAt: true,
  tableId: true,
  table: true,
} as const;

const PAYABLE_ORDER_INCLUDE = {
  items: { include: { menuItem: true, selectedOptions: true } },
} as const;

type PayableOrder = Prisma.OrderGetPayload<{
  include: typeof PAYABLE_ORDER_INCLUDE;
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreatePaymentDto) {
    if (!dto.tableSessionId && !dto.orderIds?.length) {
      throw new BadRequestException('ต้องส่ง tableSessionId หรือ orderIds อย่างน้อยหนึ่งอย่าง');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const orders = dto.orderIds?.length
        ? await this.resolveOrdersByIds(tx, dto.orderIds)
        : await this.resolveUnpaidSessionOrders(tx, dto.tableSessionId!);

      const amount = this.calculateOrdersTotal(orders);
      // บิลนี้ผูกกับ session ของออเดอร์ใบแรก (กรณีรวมบิลข้ามโต๊ะจะมีหลาย session)
      const primarySessionId = orders[0].tableSessionId!;
      const primaryTableId = orders[0].tableId;

      // ช่องว่างล้วนถือว่าไม่มีหมายเหตุ
      const note = dto.note?.trim() || null;

      const payment = await tx.payment.create({
        data: {
          tableSessionId: primarySessionId,
          amount,
          method: dto.method,
          note,
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((order) => order.id) } },
        data: { status: OrderStatus.PAID, paymentId: payment.id },
      });

      const receipt = await tx.receipt.create({
        data: {
          number: await this.generateReceiptNumber(tx),
          subtotal: amount,
          total: amount,
          note,
          paymentId: payment.id,
          tableId: primaryTableId,
          tableSessionId: primarySessionId,
          items: { create: this.buildReceiptItems(orders) },
        },
        include: { items: true },
      });

      // ปิดเฉพาะ session ที่จ่ายครบทุกออเดอร์แล้ว (แยกบิลจ่ายบางส่วนจะยังไม่ปิด)
      const affectedSessionIds = [
        ...new Set(orders.map((order) => order.tableSessionId!)),
      ];
      const closedSessionIds: string[] = [];
      for (const sessionId of affectedSessionIds) {
        if (await this.closeSessionIfFullyPaid(tx, sessionId)) {
          closedSessionIds.push(sessionId);
        }
      }

      return {
        ...payment,
        receipt,
        paidOrderIds: orders.map((order) => order.id),
        closedSessionIds,
        affectedSessionIds,
      };
    });

    // รวมบิลข้ามโต๊ะ = หลาย session; แจ้งลูกค้าทุกโต๊ะที่เกี่ยวข้อง
    const { affectedSessionIds, ...payload } = result;
    this.events.emitToStaff('payment.created', payload);
    for (const sessionId of affectedSessionIds) {
      this.events.emitToSession(sessionId, 'payment.created', payload);
    }
    return payload;
  }

  async voidPayment(id: string, dto: VoidPaymentDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
        include: { orders: { select: { id: true, tableSessionId: true } } },
      });
      if (!payment) {
        throw new NotFoundException(`ไม่พบการชำระเงิน id: ${id}`);
      }
      if (payment.status === PaymentStatus.VOIDED) {
        throw new ConflictException('บิลนี้ถูกยกเลิกไปแล้ว');
      }

      const voided = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: dto.reason,
        },
      });

      // คืนออเดอร์กลับไปสถานะเสิร์ฟแล้ว เพื่อให้เก็บเงินใหม่ได้
      await tx.order.updateMany({
        where: { paymentId: id },
        data: { status: OrderStatus.SERVED, paymentId: null },
      });

      const affectedSessionIds = [
        ...new Set(
          payment.orders
            .map((order) => order.tableSessionId)
            .filter((sessionId): sessionId is string => Boolean(sessionId)),
        ),
      ];
      for (const sessionId of affectedSessionIds) {
        await this.reopenSession(tx, sessionId);
      }

      return { ...voided, reopenedSessionIds: affectedSessionIds };
    });

    this.events.emitToStaff('payment.voided', result);
    for (const sessionId of result.reopenedSessionIds) {
      this.events.emitToSession(sessionId, 'payment.voided', result);
    }
    return result;
  }

  findAll() {
    return this.prisma.payment.findMany({
      include: {
        receipt: true,
        tableSession: { select: TABLE_SESSION_SELECT },
        orders: { select: { id: true, status: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        receipt: { include: { items: true } },
        tableSession: { select: TABLE_SESSION_SELECT },
        orders: { select: { id: true, status: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException(`ไม่พบการชำระเงิน id: ${id}`);
    }
    return payment;
  }

  /** จ่ายเฉพาะออเดอร์ที่ระบุ — ใช้ทั้งแยกบิล และรวมบิลข้ามโต๊ะ */
  private async resolveOrdersByIds(
    tx: Prisma.TransactionClient,
    orderIds: string[],
  ): Promise<PayableOrder[]> {
    const uniqueIds = [...new Set(orderIds)];
    const orders = await tx.order.findMany({
      where: { id: { in: uniqueIds } },
      include: PAYABLE_ORDER_INCLUDE,
    });

    if (orders.length !== uniqueIds.length) {
      const found = new Set(orders.map((order) => order.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(`ไม่พบออเดอร์ id: ${missing.join(', ')}`);
    }

    for (const order of orders) {
      if (!order.tableSessionId) {
        throw new BadRequestException(
          `ออเดอร์ ${order.id} ไม่ได้อยู่ใน QR session จึงเก็บเงินแบบนี้ไม่ได้`,
        );
      }
      if (order.status === OrderStatus.PAID) {
        throw new ConflictException(`ออเดอร์ ${order.id} ถูกชำระเงินไปแล้ว`);
      }
      if (order.status !== OrderStatus.SERVED) {
        throw new BadRequestException(
          `ออเดอร์ ${order.id} ยังไม่ถูกเสิร์ฟ จึงเก็บเงินไม่ได้`,
        );
      }
    }

    return orders;
  }

  /** จ่ายทั้ง session (พฤติกรรมเดิม) — ต้องเสิร์ฟครบทุกออเดอร์ก่อน */
  private async resolveUnpaidSessionOrders(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
  ): Promise<PayableOrder[]> {
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${tableSessionId}`);
    }

    const orders = await tx.order.findMany({
      where: {
        tableSessionId,
        status: { not: OrderStatus.CANCELLED },
        paymentId: null,
      },
      include: PAYABLE_ORDER_INCLUDE,
    });

    if (orders.length === 0) {
      throw new BadRequestException('ยังไม่มีออเดอร์ที่ต้องชำระใน session นี้');
    }

    const notReadyOrder = orders.find(
      (order) => order.status !== OrderStatus.SERVED,
    );
    if (notReadyOrder) {
      throw new BadRequestException(
        'ชำระเงินได้เมื่อทุกออเดอร์ใน session ถูกเสิร์ฟแล้ว',
      );
    }

    return orders;
  }

  /** ปิด session + คืนโต๊ะให้ว่าง ถ้าไม่เหลือออเดอร์ค้างจ่ายแล้ว */
  private async closeSessionIfFullyPaid(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
  ) {
    const unpaidCount = await tx.order.count({
      where: {
        tableSessionId,
        status: { not: OrderStatus.CANCELLED },
        paymentId: null,
      },
    });
    if (unpaidCount > 0) return false;

    const session = await tx.tableSession.update({
      where: { id: tableSessionId },
      data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
      select: { tableId: true },
    });
    await tx.restaurantTable.update({
      where: { id: session.tableId },
      data: { status: TableStatus.AVAILABLE },
    });
    return true;
  }

  /** เปิด session กลับหลังยกเลิกบิล เพื่อให้เก็บเงินใหม่ได้ */
  private async reopenSession(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
  ) {
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { id: true, status: true, tableId: true },
    });
    if (!session || session.status === TableSessionStatus.OPEN) return;

    await tx.tableSession.update({
      where: { id: tableSessionId },
      data: { status: TableSessionStatus.OPEN, closedAt: null },
    });
    await tx.restaurantTable.update({
      where: { id: session.tableId },
      data: { status: TableStatus.OCCUPIED },
    });
  }

  private calculateOrdersTotal(orders: PayableOrder[]) {
    return orders.reduce(
      (orderSum, order) =>
        orderSum.plus(
          order.items.reduce((itemSum, item) => {
            const optionTotal = item.selectedOptions.reduce(
              (optionSum, option) => optionSum.plus(option.price),
              new Prisma.Decimal(0),
            );
            return itemSum.plus(
              item.unitPrice.plus(optionTotal).mul(item.quantity),
            );
          }, new Prisma.Decimal(0)),
        ),
      new Prisma.Decimal(0),
    );
  }

  private buildReceiptItems(orders: PayableOrder[]) {
    return orders.flatMap((order) =>
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
  }

  private async generateReceiptNumber(tx: Prisma.TransactionClient) {
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const todayCount = await tx.receipt.count({
      where: {
        issuedAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    return `RCPT-${datePrefix}-${String(todayCount + 1).padStart(4, '0')}`;
  }
}
