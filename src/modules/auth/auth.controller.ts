import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ApiTags } from '@nestjs/swagger';
import { RefreshDto } from './dto/refreshDto';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  refreshAccessToken(@Body() refreshDto: RefreshDto) {
    return this.authService.refreshAccessToken(refreshDto);
  }
}
