import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class OrderItemInputDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'ไม่ใส่ผักชี' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['option-uuid-egg', 'option-uuid-pork'],
    description: 'รายการ option ที่เลือกจากกลุ่มของเมนูนี้',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  optionIds?: string[];
}
