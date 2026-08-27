import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableSessionDto } from './dto/create-table-session.dto';

const DEFAULT_SESSION_TTL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class TableSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTableSessionDto) {
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt ต้องเป็นเวลาในอนาคต');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const table = await tx.restaurantTable.findUnique({
        where: { id: dto.tableId },
      });
      if (!table) {
        throw new NotFoundException(`ไม่พบโต๊ะ id: ${dto.tableId}`);
      }

      const activeSession = await tx.tableSession.findFirst({
        where: { tableId: dto.tableId, status: TableSessionStatus.OPEN },
      });
      if (activeSession) {
        throw new ConflictException('โต๊ะนี้มี QR session ที่เปิดอยู่แล้ว');
      }

      if (table.status !== TableStatus.AVAILABLE) {
        throw new ConflictException('เปิด QR session ได้เฉพาะโต๊ะที่ว่าง');
      }

      const session = await tx.tableSession.create({
        data: {
          tableId: dto.tableId,
          token: this.generateToken(),
          expiresAt,
        },
        include: { table: true },
      });

      await tx.restaurantTable.update({
        where: { id: dto.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return session;
    });
  }

  async findAll(status?: TableSessionStatus) {
    const sessions = await this.prisma.tableSession.findMany({
      where: { status },
      include: {
        table: true,
        orders: {
          include: { items: { include: { selectedOptions: true } } },
        },
        serviceRequests: {
          where: {
            type: ServiceRequestType.CHECKOUT,
            status: ServiceRequestStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    return sessions.map((session) => this.toSessionSummary(session));
  }

  async findOne(id: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id },
      include: {
        table: true,
        orders: {
          include: { items: { include: { selectedOptions: true } } },
          orderBy: { createdAt: 'desc' },
        },
        serviceRequests: {
          where: {
            type: ServiceRequestType.CHECKOUT,
            status: ServiceRequestStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${id}`);
    }
    return this.toSessionSummary(session);
  }

  async close(id: string) {
    const session = await this.findOne(id);
    if (session.status !== TableSessionStatus.OPEN) {
      return session;
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const openOrderCount = await tx.order.count({
        where: {
          tableSessionId: id,
          status: {
            in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED],
          },
        },
      });

      if (openOrderCount > 0) {
        throw new ConflictException('ยังมีออเดอร์ที่ไม่ปิดใน session นี้');
      }

      await tx.tableSession.update({
        where: { id },
        data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
      });

      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.AVAILABLE },
      });
    });

    return this.findOne(id);
  }

  /** ใช้ร่วมกันโดย public/service-requests เพื่อ resolve + validate QR session จาก token */
  async resolveOpenSessionByToken(token: string) {
    if (!token) {
      throw new BadRequestException('ต้องส่ง sessionToken');
    }

    const session = await this.prisma.tableSession.findUnique({
      where: { token },
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
    return session;
  }

  private generateToken() {
    return randomBytes(24).toString('hex');
  }

  private toSessionSummary(
    session: Prisma.TableSessionGetPayload<{
      include: {
        table: true;
        orders: { include: { items: { include: { selectedOptions: true } } } };
        serviceRequests: true;
      };
    }>,
  ) {
    const { serviceRequests, ...rest } = session;
    const checkoutRequest =
      serviceRequests
        .filter(
          (request) =>
            request.type === ServiceRequestType.CHECKOUT &&
            request.status === ServiceRequestStatus.PENDING,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null;

    return {
      ...rest,
      total: this.calculateSessionTotal(session.orders),
      billingStatus: checkoutRequest ? 'AWAITING_CHECKOUT' : 'IN_PROGRESS',
      checkoutRequest: checkoutRequest
        ? {
            id: checkoutRequest.id,
            paymentMethod: checkoutRequest.paymentMethod,
            createdAt: checkoutRequest.createdAt,
          }
        : null,
    };
  }

  private calculateSessionTotal(
    orders: Prisma.OrderGetPayload<{
      include: { items: { include: { selectedOptions: true } } };
    }>[],
  ) {
    return orders
      .filter((order) => order.status !== OrderStatus.CANCELLED)
      .reduce(
        (orderSum, order) =>
          orderSum.plus(
            order.items.reduce((itemSum, item) => {
              const optionTotal = item.selectedOptions.reduce(
                (optionSum, option) => optionSum.plus(option.price),
                new Prisma.Decimal(0),
              );
              return itemSum.plus(item.unitPrice.plus(optionTotal).mul(item.quantity));
            }, new Prisma.Decimal(0)),
          ),
        new Prisma.Decimal(0),
      );
  }
}
