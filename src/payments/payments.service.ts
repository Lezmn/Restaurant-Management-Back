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
            include: { items: { include: { selectedOptions: true } } },
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

      return payment;
    });
  }
}
