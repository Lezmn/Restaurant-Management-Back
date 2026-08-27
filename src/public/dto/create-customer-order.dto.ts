import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { OrderItemInputDto } from '../../orders/dto/order-item-input.dto';

export class CreateCustomerOrderDto {
  @ApiProperty({
    example: 'qr-session-token',
    description: 'token จาก QR session ของโต๊ะ',
  })
  @IsString()
  sessionToken: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
