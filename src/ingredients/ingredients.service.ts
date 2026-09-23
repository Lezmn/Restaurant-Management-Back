import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

const INGREDIENT_INCLUDE = {
  _count: { select: { menuOptions: true } },
} as const;

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateIngredientDto) {
    try {
      const ingredient = await this.prisma.ingredient.create({
        data: { name: dto.name.trim(), isAvailable: dto.isAvailable },
        include: INGREDIENT_INCLUDE,
      });
      this.emitMenuChanged();
      return ingredient;
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  findAll() {
    return this.prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
      include: INGREDIENT_INCLUDE,
    });
  }

  async findOne(id: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: INGREDIENT_INCLUDE,
    });
    if (!ingredient) {
      throw new NotFoundException(`ไม่พบวัตถุดิบ id: ${id}`);
    }
    return ingredient;
  }

  async update(id: string, dto: UpdateIngredientDto) {
    await this.findOne(id);
    try {
      const ingredient = await this.prisma.ingredient.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.isAvailable === undefined
            ? {}
            : { isAvailable: dto.isAvailable }),
        },
        include: INGREDIENT_INCLUDE,
      });
      // ปิดวัตถุดิบ = เมนูที่ใช้วัตถุดิบนี้เปลี่ยนตัวเลือกทันที ต้องบอกจอลูกค้าที่เปิดค้างไว้ด้วย
      this.emitMenuChanged();
      return ingredient;
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  async remove(id: string) {
    const ingredient = await this.findOne(id);
    if (ingredient._count.menuOptions > 0) {
      throw new ConflictException(
        `ลบไม่ได้: วัตถุดิบนี้ยังผูกกับตัวเลือกเมนูอยู่ ${ingredient._count.menuOptions} รายการ ต้องปลดออกจากเมนูก่อน`,
      );
    }
    const removed = await this.prisma.ingredient.delete({ where: { id } });
    this.emitMenuChanged();
    return removed;
  }

  /** เมนู/ตัวเลือกเปลี่ยน — ให้ทุกจอ (พนักงาน + ลูกค้าที่เปิดค้างไว้) ดึงเมนูใหม่ */
  private emitMenuChanged() {
    this.events.emitToEveryone('menu.updated', { at: new Date().toISOString() });
  }

  private mapPrismaError(e: unknown, name?: string): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(`มีวัตถุดิบชื่อ "${name}" อยู่แล้ว`);
    }
    return e as Error;
  }
}
