import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { FindServiceRequestsQueryDto } from './dto/find-service-requests-query.dto';

const SERVICE_REQUEST_INCLUDE = {
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
} as const;

@Injectable()
export class ServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceRequestDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: dto.tableId },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException(`ไม่พบโต๊ะ id: ${dto.tableId}`);
    }

    if (dto.tableSessionId) {
      await this.assertSessionBelongsToTable(dto.tableSessionId, dto.tableId);
    }

    return this.prisma.serviceRequest.create({
      data: dto,
      include: SERVICE_REQUEST_INCLUDE,
    });
  }

  async createCallStaffFromSessionToken(sessionToken: string) {
    if (!sessionToken) {
      throw new BadRequestException('ต้องส่ง sessionToken');
    }

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

    return this.prisma.serviceRequest.create({
      data: {
        tableId: session.tableId,
        tableSessionId: session.id,
        type: ServiceRequestType.CALL_STAFF,
      },
      include: SERVICE_REQUEST_INCLUDE,
    });
  }

  findAll(query: FindServiceRequestsQueryDto) {
    return this.prisma.serviceRequest.findMany({
      where: {
        status: query.status,
        type: query.type,
        tableId: query.tableId,
        tableSessionId: query.tableSessionId,
      },
      include: SERVICE_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: SERVICE_REQUEST_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException(`ไม่พบ service request id: ${id}`);
    }
    return request;
  }

  async resolve(id: string) {
    await this.findOne(id);
    return this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.RESOLVED,
        resolvedAt: new Date(),
      },
      include: SERVICE_REQUEST_INCLUDE,
    });
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.CANCELLED,
        resolvedAt: new Date(),
      },
      include: SERVICE_REQUEST_INCLUDE,
    });
  }

  private async assertSessionBelongsToTable(
    tableSessionId: string,
    tableId: string,
  ) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { tableId: true },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${tableSessionId}`);
    }
    if (session.tableId !== tableId) {
      throw new BadRequestException('QR session ไม่ได้อยู่ในโต๊ะนี้');
    }
  }
}
