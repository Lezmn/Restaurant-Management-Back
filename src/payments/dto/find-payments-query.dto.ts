import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/** กรองตามเวลาจ่าย [from, to) — หน้า POS ส่งแค่ช่วง "วันนี้" ไม่ต้องดึงบิลทั้งประวัติร้าน */
export class FindPaymentsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-15T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-16T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
