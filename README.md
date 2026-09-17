# Restaurant Management API

สแตก: NestJS + Prisma + PostgreSQL + Docker

## โครงสร้างโปรเจกต์

```
restaurant-app/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma      # data model หลัก (User, Category, MenuItem, MenuOption,
│   │                      #   RestaurantTable, TableSession, Order, OrderItem,
│   │                      #   OrderItemOption, Payment, Receipt, ReceiptItem, ServiceRequest)
│   └── seed.ts            # seed ข้อมูลตัวอย่าง
└── src/
    ├── main.ts             # bootstrap + ValidationPipe + Swagger setup
    ├── app.module.ts       # root module รวมทุก feature module
    ├── prisma/             # PrismaService แบบ global module
    ├── auth/               # login, JWT strategy, JwtAuthGuard + RolesGuard (global)
    ├── categories/         # จัดการหมวดหมู่เมนู
    ├── menu/               # จัดการเมนู + option ของเมนู
    ├── tables/             # จัดการโต๊ะ
    ├── table-sessions/     # เปิด/ปิด QR session ต่อโต๊ะ
    ├── orders/             # ออเดอร์ + รายการสั่งในออเดอร์
    ├── payments/           # ชำระเงินต่อ session (ออก receipt อัตโนมัติ)
    ├── service-requests/   # คำขอจากโต๊ะ เช่น เรียกพนักงาน, ขอเช็คบิล
    ├── events/             # WebSocket gateway (socket.io) push event ให้ POS/ครัว/ลูกค้า
    └── public/             # endpoint ฝั่งลูกค้า (ไม่ต้อง login) ใช้คู่กับ QR session
```

## Auth

- Login ผ่าน `POST /auth/login` ได้ JWT กลับมา ใช้แนบใน header `Authorization: Bearer <token>`
- Guard เป็น global (`JwtAuthGuard` + `RolesGuard`) ทุก endpoint ต้อง login ตามค่าเริ่มต้น
- ใส่ `@Public()` ที่ controller/route เพื่อยกเว้นการ login (ใช้กับ `auth/login` และ endpoint ใน `public/` ทั้งหมด)
- ใส่ `@Roles(Role.ADMIN, ...)` เพื่อจำกัดสิทธิ์ตาม role: `ADMIN`, `STAFF`, `KITCHEN`

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

## API Docs

ดูรายการ endpoint ทั้งหมด (path, method, role, request/response) ได้ที่ Swagger: `http://localhost:3000/docs`

## WebSocket (realtime)

Server push event ผ่าน socket.io ที่ port เดียวกับ REST (`http://localhost:3000`) — client ไม่ต้อง poll

**ต่อ socket** ส่ง auth มาใน handshake อย่างใดอย่างหนึ่ง:

```js
import { io } from 'socket.io-client'
io('http://localhost:3000', { auth: { token: '<JWT พนักงาน>' } })        // เข้าห้อง staff
io('http://localhost:3000', { auth: { sessionToken: '<token จาก QR>' } }) // เข้าห้องของ session ตัวเอง
```

ไม่ส่ง auth / token ผิด / session ปิดแล้ว → server ส่ง `error` แล้วตัดการเชื่อมต่อทันที

**Event ที่ server ส่ง** (payload มีแค่ id + สถานะ ให้ client ไป refetch REST เอง)

| event | ส่งให้ | เมื่อ |
|---|---|---|
| `order.created` / `order.updated` | staff + ลูกค้าโต๊ะนั้น | สั่งใหม่ / เปลี่ยนสถานะ / แก้รายการ |
| `service-request.created` / `.updated` | staff + ลูกค้าโต๊ะนั้น | เรียกพนักงาน / ขอเช็คบิล / รับเรื่องแล้ว |
| `payment.created` / `payment.voided` | staff + ลูกค้าโต๊ะนั้น | รับเงิน (มี receipt ติดมา) / ยกเลิกบิล |
| `table-session.created` / `.closed` | staff (+ ลูกค้าตอนปิด) | เปิด QR / ปิดโต๊ะหรือหมดอายุ |

ชื่อ event ทั้งหมดอยู่ที่ `src/events/events.gateway.ts` (`ServerEvent`) — frontend มี map event → query key ที่ `features/live/hooks.ts`

CORS ของ socket ใช้ `CORS_ORIGIN` ตัวเดียวกับ REST (ตั้งใน `SocketIoAdapter`, `main.ts`)