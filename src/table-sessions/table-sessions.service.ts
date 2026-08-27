import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableSessionDto } from './dto/create-table-session.dto';

@Injectable()
export class TableSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTableSessionDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
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

  findAll(status?: TableSessionStatus) {
    return this.prisma.tableSession.findMany({
      where: { status },
      include: { table: true, orders: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id },
      include: { table: true, orders: { orderBy: { createdAt: 'desc' } } },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${id}`);
    }
    return session;
  }

  async close(id: string) {
    const session = await this.findOne(id);
    if (session.status !== TableSessionStatus.OPEN) {
      return session;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const closed = await tx.tableSession.update({
        where: { id },
        data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
        include: { table: true, orders: true },
      });

      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.AVAILABLE },
      });

      return closed;
    });
  }

  private generateToken() {
    return randomBytes(24).toString('hex');
  }
}
