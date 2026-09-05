import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'ชำระเงิน — ส่ง tableSessionId เพื่อจ่ายทั้งโต๊ะ หรือส่ง orderIds เพื่อแยกบิล/รวมบิลข้ามโต๊ะ',
  })
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Patch(':id/void')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'ยกเลิกบิลที่จ่ายผิด — คืนออเดอร์กลับเป็นเสิร์ฟแล้ว และเปิดโต๊ะกลับให้เก็บเงินใหม่',
  })
  voidPayment(@Param('id') id: string, @Body() dto: VoidPaymentDto) {
    return this.paymentsService.voidPayment(id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดึงรายการชำระเงินทั้งหมด พร้อม receipt' })
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดึงการชำระเงินตาม id พร้อม receipt' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }
}
