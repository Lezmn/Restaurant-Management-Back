import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiPropertyOptional({
    example: 'table-session-uuid',
    description: 'เก็บเงินทั้ง session (ต้องเสิร์ฟครบทุกออเดอร์) — ถ้าส่ง orderIds มาด้วยจะใช้ orderIds แทน',
  })
  @IsOptional()
  // ไม่บังคับเป็น UUID เพราะ session ที่ถูก backfill จาก migration
  // ใช้ id รูปแบบ 'migrated-payment-<paymentId>' ซึ่งเก็บเงินไม่ได้เลยถ้าเช็ค UUID
  @IsString()
  @IsNotEmpty()
  tableSessionId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['order-uuid-1', 'order-uuid-2'],
    description:
      'เก็บเงินเฉพาะออเดอร์ที่ระบุ — ใช้แยกบิล (บางออเดอร์ในโต๊ะ) หรือรวมบิล (ออเดอร์ข้ามโต๊ะ)',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds?: string[];

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
