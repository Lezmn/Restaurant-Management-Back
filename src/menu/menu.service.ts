import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  findAll(params?: { categoryId?: string; onlyAvailable?: boolean }) {
    return this.prisma.menuItem.findMany({
      where: {
        categoryId: params?.categoryId,
        isAvailable: params?.onlyAvailable ? true : undefined,
      },
      include: { category: true, options: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: { category: true, options: true },
    });
    if (!item) {
      throw new NotFoundException(`ไม่พบเมนู id: ${id}`);
    }
    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id); // throws 404 if not found
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.menuItem.delete({ where: { id } });
  }

  async createOption(menuItemId: string, dto: CreateMenuOptionDto) {
    await this.findOne(menuItemId);
    return this.prisma.menuOption.create({ data: { menuItemId, ...dto } });
  }
}
