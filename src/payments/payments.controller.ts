import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.CASHIER)
  @ApiOperation({ summary: 'ชำระเงินรวมทั้ง QR session' })
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.CASHIER)
  @ApiOperation({ summary: 'ดึงรายการชำระเงินทั้งหมด พร้อม receipt' })
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.CASHIER)
  @ApiOperation({ summary: 'ดึงการชำระเงินตาม id พร้อม receipt' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }
}
