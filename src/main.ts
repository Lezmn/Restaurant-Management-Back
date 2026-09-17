import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DecimalInterceptor } from './common/interceptors/decimal.interceptor';
import { SocketIoAdapter } from './events/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // frontend รันคนละ origin (Vite dev server) ต้องเปิด CORS ไม่งั้น browser บล็อก
  // ใส่หลาย origin ได้โดยคั่นด้วย comma ใน CORS_ORIGIN
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  // WebSocket (socket.io) ใช้ origin ชุดเดียวกัน — ดู events/events.gateway.ts
  app.useWebSocketAdapter(new SocketIoAdapter(app, corsOrigins));

  // Prisma ส่ง Decimal เป็น string ตอน serialize — แปลงเป็น number ให้ทุก response
  app.useGlobalInterceptors(new DecimalInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัด field ที่ไม่ได้ประกาศใน DTO ทิ้ง
      transform: true, // แปลง type อัตโนมัติ (เช่น query string -> number)
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Restaurant Management API')
    .setDescription('API สำหรับจัดการร้านอาหาร: เมนู, ออเดอร์, โต๊ะ, พนักงาน')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
