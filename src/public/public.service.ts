import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import { CallStaffDto } from './dto/call-staff.dto';
import { CreateCustomerOrderDto } from './dto/create-customer-order.dto';

const PUBLIC_ORDER_INCLUDE = {
  table: true,
  items: {
    include: {
      menuItem: true,
      selectedOptions: true,
    },
  },
} as const;

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  getMenu() {
    return this.prisma.category.findMany({
      include: {
        menuItems: {
          where: { isAvailable: true },
          include: {
            options: {
              where: { isAvailable: true },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getSession(token: string) {
    const session = await this.getOpenSession(token);

    return {
      id: session.id,
      token: session.token,
      status: session.status,
      openedAt: session.openedAt,
      expiresAt: session.expiresAt,
      table: {
        id: session.table.id,
        number: session.table.number,
        seats: session.table.seats,
      },
    };
  }

  createOrder(dto: CreateCustomerOrderDto) {
    return this.ordersService.createFromTableSession(dto.sessionToken, dto.items);
  }

  async getOrdersBySession(token: string) {
    const session = await this.getOpenSession(token);
    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
      include: PUBLIC_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.toPublicOrder(order));
  }

  async getOrderStatus(orderId: string, sessionToken: string) {
    if (!sessionToken) {
      throw new BadRequestException('ต้องส่ง sessionToken');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tableSession: { token: sessionToken },
      },
      include: PUBLIC_ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('ไม่พบออเดอร์ของ QR session นี้');
    }

    return this.toPublicOrder(order);
  }

  async callStaff(dto: CallStaffDto) {
    const request =
      await this.serviceRequestsService.createCallStaffFromSessionToken(
        dto.sessionToken,
      );
    return {
      ok: true,
      id: request.id,
      status: request.status,
      tableNumber: request.table.number,
      createdAt: request.createdAt,
    };
  }

  private async getOpenSession(token: string) {
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

  private toPublicOrder(
    order: Prisma.OrderGetPayload<{ include: typeof PUBLIC_ORDER_INCLUDE }>,
  ) {
    const total = order.items.reduce((sum, item) => {
      const optionTotal = item.selectedOptions.reduce(
        (optionSum, option) => optionSum + Number(option.price),
        0,
      );
      return sum + (Number(item.unitPrice) + optionTotal) * item.quantity;
    }, 0);

    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      isClosed:
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.CANCELLED,
      table: {
        id: order.table.id,
        number: order.table.number,
      },
      items: order.items.map((item) => ({
        id: item.id,
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        note: item.note,
        options: item.selectedOptions.map((option) => ({
          id: option.id,
          name: option.name,
          price: Number(option.price),
        })),
      })),
      total,
    };
  }
}
