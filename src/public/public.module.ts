import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
