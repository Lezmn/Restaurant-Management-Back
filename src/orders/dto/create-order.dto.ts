import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { OrderItemInputDto } from './order-item-input.dto';

export class CreateOrderDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID()
  tableId: string;

  @ApiProperty({ example: 'waiter-user-uuid' })
  @IsUUID()
  waiterId: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
