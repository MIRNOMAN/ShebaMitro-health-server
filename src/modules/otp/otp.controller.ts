import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OtpService } from './otp.service.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('OTP Authentication')
@Controller('auth')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Public()
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a 6-digit OTP code (Rate limit: max 3 attempts per 10 minutes)',
  })
  @ResponseMessage('OTP code requested successfully')
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code and issue onboarding claims' })
  @ResponseMessage('OTP verified successfully')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.otpService.verifyOtp(dto);

    if (result.accessToken) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });
    }

    return result;
  }
}
