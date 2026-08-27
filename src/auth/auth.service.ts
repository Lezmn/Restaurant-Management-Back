import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = user && await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches || !user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
