import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CallStaffDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;

  @ApiPropertyOptional({ example: 'ขอน้ำแข็งเพิ่มครับ' })
  @IsOptional()
  @IsString()
  message?: string;
}
