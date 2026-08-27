FROM node:20-alpine

# Prisma engine ต้องการ OpenSSL — alpine ไม่มีติดตั้งมาให้ ทำให้ engine crash
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
