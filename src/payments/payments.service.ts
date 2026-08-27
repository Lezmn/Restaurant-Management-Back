import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findUnique({
        where: { id: dto.tableSessionId },
        include: {
          payment: true,
          orders: {
            where: { status: { not: OrderStatus.CANCELLED } },
            include: {
              items: { include: { menuItem: true, selectedOptions: true } },
            },
          },
        },
      });
      if (!session) {
        throw new NotFoundException(`ไม่พบ QR session id: ${dto.tableSessionId}`);
      }
      if (session.payment) {
        throw new ConflictException('QR session นี้ชำระเงินแล้ว');
      }
      if (session.orders.length === 0) {
        throw new BadRequestException('ยังไม่มีออเดอร์สำหรับชำระเงิน');
      }

      const notReadyOrder = session.orders.find(
        (order) => order.status !== OrderStatus.SERVED,
      );
      if (notReadyOrder) {
        throw new BadRequestException(
          'ชำระเงินได้เมื่อทุกออเดอร์ใน session ถูกเสิร์ฟแล้ว',
        );
      }

      const amount = session.orders.reduce(
        (orderSum, order) =>
          orderSum.plus(
            order.items.reduce(
              (itemSum, item) => {
                const optionAmount = item.selectedOptions.reduce(
                  (optionSum, option) => optionSum.plus(option.price),
                  new Prisma.Decimal(0),
                );
                return itemSum.plus(item.unitPrice.plus(optionAmount).mul(item.quantity));
              },
              new Prisma.Decimal(0),
            ),
          ),
        new Prisma.Decimal(0),
      );

      const payment = await tx.payment.create({
        data: { tableSessionId: session.id, amount, method: dto.method },
      });

      await tx.order.updateMany({
        where: { tableSessionId: session.id, status: OrderStatus.SERVED },
        data: { status: OrderStatus.PAID },
      });

      await tx.tableSession.update({
        where: { id: session.id },
        data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
      });

      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.AVAILABLE },
      });

      const receiptNumber = await this.generateReceiptNumber(tx);
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNumber,
          subtotal: amount,
          total: amount,
          paymentId: payment.id,
          tableId: session.tableId,
          tableSessionId: session.id,
          items: { create: this.buildReceiptItems(session.orders) },
        },
        include: { items: true },
      });

      return { ...payment, receipt };
    });
  }

  private buildReceiptItems(
    orders: Prisma.TableSessionGetPayload<{
      include: {
        orders: {
          include: {
            items: { include: { menuItem: true; selectedOptions: true } };
          };
        };
      };
    }>['orders'],
  ) {
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
