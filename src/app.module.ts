import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { CategoriesModule } from './categories/categories.module';
import { TablesModule } from './tables/tables.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthModule } from './auth/auth.module';
import { TableSessionsModule } from './table-sessions/table-sessions.module';
import { PublicModule } from './public/public.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { UsersModule } from './users/users.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit ทั้งแอปต่อ IP กัน bot ยิงถล่ม — /auth/login เข้มกว่านี้อีก (ดู auth.controller)
    // ปรับได้ผ่าน THROTTLE_LIMIT (ครั้ง/นาที) เช่นตอนรัน load test
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: 60_000,
          limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
        },
      ],
    }),
    PrismaModule,
    EventsModule,
    CategoriesModule,
    MenuModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    TableSessionsModule,
    PublicModule,
    ServiceRequestsModule,
    UsersModule,
    ExpensesModule,
    ReportsModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
