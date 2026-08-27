import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateServiceRequestDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID()
  tableId: string;

  @ApiPropertyOptional({ example: 'table-session-uuid' })
  @IsOptional()
  @IsUUID()
  tableSessionId?: string;

  @ApiProperty({
    enum: ServiceRequestType,
    example: ServiceRequestType.CALL_STAFF,
  })
  @IsEnum(ServiceRequestType)
  type: ServiceRequestType;
}
