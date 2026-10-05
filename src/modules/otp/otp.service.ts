import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import type { SmsAdapter } from './adapters/sms-adapter.interface.js';
import type { RequestOtpDto } from './dto/request-otp.dto.js';
import type { VerifyOtpDto } from './dto/verify-otp.dto.js';

const OTP_TTL_SECONDS = 180; // 3 minutes
const RATE_LIMIT_WINDOW_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 3;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('SMS_ADAPTER') private readonly smsAdapter: SmsAdapter,
  ) {}

  /**
   * Request a 6-digit cryptographically secure OTP with rate limiting.
   */
  async requestOtp(dto: RequestOtpDto) {
    const { phone } = dto;
    const attemptKey = `otp_attempts:${phone}`;

    // Increment attempts counter
    const currentAttempts = await this.redisService.incr(attemptKey);

    // Set TTL on first attempt
    if (currentAttempts === 1) {
      await this.redisService.expire(attemptKey, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (currentAttempts > MAX_ATTEMPTS) {
      const ttl = await this.redisService.ttl(attemptKey);
      this.logger.warn(`OTP rate limit exceeded for phone: ${phone}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many OTP requests. Maximum 3 attempts per 10 minutes allowed for phone ${phone}.`,
          retryAfterSeconds: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate cryptographically secure 6-digit numeric OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    // Store in Redis with 3-minute TTL
    const otpKey = `otp:${phone}`;
    await this.redisService.set(otpKey, otpCode, OTP_TTL_SECONDS);

    // Send SMS via configured SMS adapter
    const smsMessage = `Your ShebaMitro verification code is: ${otpCode}. Valid for 3 minutes.`;
    await this.smsAdapter.sendSms(phone, smsMessage);

    this.logger.log(`OTP generated for ${phone}: ${otpCode}`);

    return {
      message: 'OTP sent successfully',
      phone,
      ttlSeconds: OTP_TTL_SECONDS,
    };
  }

  /**
   * Verify OTP code and update user verification status.
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, code } = dto;
    const otpKey = `otp:${phone}`;

    const storedOtp = await this.redisService.get(otpKey);

    if (!storedOtp || storedOtp !== code) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    // Clear OTP from Redis once verified
    await this.redisService.del(otpKey);

    // Find User by phone if existing
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    let updatedUser = null;
    let userId = null;
    let role = 'PATIENT';
    let email = null;

    if (user) {
      updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });
      userId = user.id;
      role = user.role;
      email = user.email;
    }

    // Generate onboarding claim tokens
    const secret = this.configService.get<string>('JWT_SECRET');
    const onboardingClaims = {
      isVerified: true,
      onboardingCompleted: true,
      canAccessOnboarding: true,
    };

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        phone,
        role,
        isVerified: true,
        onboardingClaims,
      },
      {
        secret,
        expiresIn: '15m',
      },
    );

    return {
      message: 'OTP verified successfully',
      isVerified: true,
      onboardingClaims,
      user: updatedUser
        ? {
            id: updatedUser.id,
            email: updatedUser.email,
            phone: updatedUser.phone,
            role: updatedUser.role,
            isVerified: updatedUser.isVerified,
          }
        : null,
      accessToken,
    };
  }
}
