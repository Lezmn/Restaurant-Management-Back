import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  // เดารหัสได้แค่ 5 ครั้ง/นาที/IP — เข้มกว่า limit ทั้งแอปเพราะเป็นจุดที่ bot ชอบยิง
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'เข้าสู่ระบบและรับ JWT access token' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto); }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ดูข้อมูลผู้ใช้ที่ login อยู่' })
  me(@Req() request: { user: AuthenticatedUser }) { return request.user; }

  @Patch('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'เปลี่ยนรหัสผ่านของตัวเอง (ต้องส่งรหัสเดิม) ทุก role ใช้ได้' })
  changePassword(
    @Req() request: { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(request.user.id, dto);
  }
}
