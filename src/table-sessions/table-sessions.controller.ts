import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Role, TableSessionStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTableSessionDto } from './dto/create-table-session.dto';
import { TableSessionsService } from './table-sessions.service';

@ApiTags('table-sessions')
@Controller('table-sessions')
export class TableSessionsController {
  constructor(private readonly tableSessionsService: TableSessionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAITER)
  @ApiOperation({ summary: 'เปิด QR session ให้โต๊ะ และนำ token ไปสร้าง QR code' })
  create(@Body() dto: CreateTableSessionDto) {
    return this.tableSessionsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.WAITER, Role.CASHIER)
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by table session status',
    enum: TableSessionStatus
  }) 
  @ApiOperation({ summary: 'ดึงรายการ QR sessions ทั้งหมด (filter ตามสถานะได้)' })
  findAll(@Query('status') status?: TableSessionStatus) {
    return this.tableSessionsService.findAll(status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.WAITER, Role.CASHIER)
  @ApiOperation({ summary: 'ดึง QR session ตาม id' })
  findOne(@Param('id') id: string) {
    return this.tableSessionsService.findOne(id);
  }

  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.WAITER, Role.CASHIER)
  @ApiOperation({ summary: 'ปิด QR session หลังจ่ายเงินครบแล้ว' })
  close(@Param('id') id: string) {
    return this.tableSessionsService.close(id);
  }
}
