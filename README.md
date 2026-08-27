# Restaurant Management API

สแตก: NestJS + Prisma + PostgreSQL + Docker

## โครงสร้างโปรเจกต์

```
restaurant-app/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma      # data model หลัก (User, MenuItem, Order, Table, Payment ...)
│   └── seed.ts            # seed ข้อมูลตัวอย่าง
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── prisma/             # PrismaService แบบ global module
    └── menu/               
```

## วิธีรัน (เลือกวิธีใดวิธีหนึ่ง)

### วิธีที่ 1: รันทุกอย่างผ่าน Docker (แนะนำสำหรับเริ่มต้น)

```bash
docker compose up --build
```

คำสั่งนี้จะ:
1. สร้าง postgres container
2. build และรัน Nest app
3. รัน `prisma migrate deploy` อัตโนมัติก่อน start

เข้าดู API docs (Swagger) ได้ที่ `http://localhost:3000/docs`

### วิธีที่ 2: รัน Postgres ใน Docker, รัน Nest app แบบ local (debug ง่ายกว่า)

```bash
# 1. รันแค่ postgres
docker compose up postgres -d

# 2. ติดตั้ง dependencies
npm install

# 3. คัดลอก env
cp .env.example .env

# 4. สร้างตารางจาก schema
npx prisma migrate dev --name init

# 5. (ไม่บังคับ) ใส่ข้อมูลตัวอย่าง
npx prisma db seed

# 6. รัน dev server
npm run start:dev
```

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npx prisma studio` | เปิด GUI ดู/แก้ข้อมูลใน database |
| `npx prisma migrate dev --name <ชื่อ>` | สร้าง migration ใหม่หลังแก้ schema |
| `npx prisma generate` | generate Prisma Client ใหม่ (รันอัตโนมัติหลัง install อยู่แล้ว) |

## ขั้นตอนถัดไปที่แนะนำ


2. **Auth**: ติดตั้ง `@nestjs/passport`, `@nestjs/jwt`, `passport-jwt`, `bcrypt` แล้วสร้าง `AuthModule` + `JwtStrategy` + `RolesGuard` เพื่อแยกสิทธิ์ admin/cashier/kitchen/waiter
3. **Order logic**: OrderItem ต้อง snapshot ราคา ณ ตอนสั่ง (`unitPrice`) ไม่ควร reference ราคาปัจจุบันของ MenuItem เพราะราคาอาจเปลี่ยนทีหลัง (schema นี้ทำไว้ให้แล้ว)
4. **Testing**: เพิ่ม Jest e2e test ยิง endpoint จริงผ่าน test database
