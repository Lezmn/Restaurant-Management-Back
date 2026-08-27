import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: { items: { include: { selectedOptions: true } }, payment: true },
      });
      if (!order) throw new NotFoundException(`ไม่พบออเดอร์ id: ${dto.orderId}`);
      if (order.payment) throw new ConflictException('ออเดอร์นี้ชำระเงินแล้ว');
      if (order.status !== OrderStatus.SERVED) {
        throw new BadRequestException('ชำระเงินได้เฉพาะออเดอร์ที่เสิร์ฟแล้ว');
      }

      const amount = order.items.reduce(
        (sum, item) => {
          const optionAmount = item.selectedOptions.reduce(
            (optionSum, option) => optionSum.plus(option.price),
            new Prisma.Decimal(0),
          );
          return sum.plus(item.unitPrice.plus(optionAmount).mul(item.quantity));
        },
        new Prisma.Decimal(0),
      );

      const payment = await tx.payment.create({
        data: { orderId: order.id, amount, method: dto.method },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });

      const remainingOpenOrders = await tx.order.count({
        where: {
          tableId: order.tableId,
          id: { not: order.id },
          status: {
            in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED],
          },
        },
      });

      if (remainingOpenOrders === 0) {
        if (order.tableSessionId) {
          await tx.tableSession.update({
            where: { id: order.tableSessionId },
            data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
          });
        }

        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: TableStatus.AVAILABLE },
        });
      }

      return payment;
    });
  }
}
