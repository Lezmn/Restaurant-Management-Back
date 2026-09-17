import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}
