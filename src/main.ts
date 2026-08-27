import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
