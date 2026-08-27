import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'table-session-uuid' })
  @IsUUID()
  tableSessionId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
