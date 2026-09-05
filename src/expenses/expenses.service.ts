import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDateRange } from '../common/date-range.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { FindExpensesQueryDto } from './dto/find-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category,
        note: dto.note,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : undefined,
      },
    });
  }

  findAll(query: FindExpensesQueryDto) {
    return this.prisma.expense.findMany({
      where: {
        category: query.category,
        spentAt: resolveDateRange(query),
      },
      orderBy: { spentAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException(`ไม่พบรายจ่าย id: ${id}`);
    }
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.findOne(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category,
        note: dto.note,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.expense.delete({ where: { id } });
  }
}
