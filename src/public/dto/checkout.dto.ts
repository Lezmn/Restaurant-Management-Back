import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
