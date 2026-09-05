import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class VoidPaymentDto {
  @ApiPropertyOptional({ example: 'กดจ่ายผิดโต๊ะ' })
  @IsOptional()
  @IsString()
  reason?: string;
}
