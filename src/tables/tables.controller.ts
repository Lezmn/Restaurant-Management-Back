import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, TableStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@ApiTags('tables')
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'เพิ่มโต๊ะใหม่' })
  create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงโต๊ะทั้งหมด (filter ตามสถานะได้ เช่น ?status=AVAILABLE)' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'กรองโต๊ะตามสถานะ ถ้าไม่ส่งจะดึงทุกโต๊ะ',
    enum: TableStatus,
  })
  findAll(@Query('status') status?: TableStatus) {
    return this.tablesService.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงโต๊ะตาม id พร้อมออเดอร์ที่ยังเปิดอยู่ (ถ้ามี)' })
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'แก้ไขโต๊ะ (เลขโต๊ะ, จำนวนที่นั่ง, หรือสถานะ)' })
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ลบโต๊ะ (ลบไม่ได้ถ้ายังมีออเดอร์เปิดอยู่)' })
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
