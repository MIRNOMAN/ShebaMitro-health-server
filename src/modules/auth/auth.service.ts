import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { Role } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const RESET_OTP_TTL_SECONDS = 600; // 10 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user with Argon2 password hashing.
   */
  async register(registerDto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        phone: registerDto.phone,
        passwordHash,
        role: registerDto.role || Role.PATIENT,
        isVerified: false,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.isVerified,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  /**
   * Login user with Argon2 verification and 5-attempt lockout control.
   */
  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // ── Check Account Lockout ───────────────────────────────────
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockoutUntil.getTime() - Date.now()) / (60 * 1000),
      );
      this.logger.warn(`Locked account login attempt for email: ${user.email}`);
      throw new ForbiddenException(
        `Account is locked due to ${MAX_FAILED_ATTEMPTS} consecutive failed attempts. Please try again in ${remainingMinutes} minutes.`,
      );
    }

    // ── Verify Password with Argon2 ─────────────────────────────
    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );

    if (!isPasswordValid) {
      const updatedAttempts = user.failedLoginAttempts + 1;
      let lockoutUntil: Date | null = null;

      if (updatedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        this.logger.warn(
          `Account locked due to 5 failed login attempts: ${user.email}`,
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: updatedAttempts,
          lockoutUntil,
        },
      });

      if (lockoutUntil) {
        throw new ForbiddenException(
          `Account locked due to ${MAX_FAILED_ATTEMPTS} consecutive failed attempts. Please try again after 15 minutes.`,
        );
      }

      throw new UnauthorizedException('Invalid credentials.');
    }

    // ── Reset Lockout Counter on Success ─────────────────────────
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.isVerified,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  /**
   * Refresh Access & Refresh Tokens using Argon2 hashed token stored in DB.
   */
  async refreshTokens(userId: string, rawRefreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException(
        'Access denied. No valid refresh session.',
      );
    }

    const isRefreshTokenValid = await argon2.verify(
      user.refreshTokenHash,
      rawRefreshToken,
    );

    if (!isRefreshTokenValid) {
      // Revoke compromised refresh tokens
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    return this.generateTokens(user.id, user.email, user.role, user.isVerified);
  }

  /**
   * Send 6-digit OTP code for password reset to email or phone.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const identifier = dto.identifier.trim().toLowerCase();

    // Check if user exists by email or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: dto.identifier.trim() }],
      },
    });

    if (!user) {
      // In dev return clear error, in production return generic response
      if (process.env.NODE_ENV === 'production') {
        return {
          message:
            'If an account exists with this credential, a password reset code has been sent.',
          identifier,
          ttlSeconds: RESET_OTP_TTL_SECONDS,
        };
      }
      throw new BadRequestException('No account found with this email/phone.');
    }

    // Generate 6-digit numeric reset code
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    // Store in Redis with 10-minute TTL
    const otpKey = `reset_otp:${identifier}`;
    await this.redisService.set(otpKey, otpCode, RESET_OTP_TTL_SECONDS);

    // Also store under phone if different
    if (user.phone && user.phone !== identifier) {
      await this.redisService.set(
        `reset_otp:${user.phone}`,
        otpCode,
        RESET_OTP_TTL_SECONDS,
      );
    }
    if (user.email && user.email !== identifier) {
      await this.redisService.set(
        `reset_otp:${user.email.toLowerCase()}`,
        otpCode,
        RESET_OTP_TTL_SECONDS,
      );
    }

    this.logger.log(`Password reset OTP for ${identifier}: ${otpCode}`);

    return {
      message: 'Password reset OTP code sent successfully',
      identifier,
      ttlSeconds: RESET_OTP_TTL_SECONDS,
      demoCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    };
  }

  /**
   * Verify reset OTP and set new password with Argon2 hashing.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const identifier = dto.identifier.trim().toLowerCase();
    const otpKey = `reset_otp:${identifier}`;

    const storedOtp = await this.redisService.get(otpKey);

    if (!storedOtp || storedOtp !== dto.code.trim()) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    // Find user by email or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: dto.identifier.trim() }],
      },
    });

    if (!user) {
      throw new BadRequestException('User account not found.');
    }

    // Hash new password using Argon2
    const passwordHash = await argon2.hash(dto.newPassword);

    // Update user in DB, reset lockout and failed attempts, revoke previous sessions
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        refreshTokenHash: null,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    // Clear reset OTP
    await this.redisService.del(otpKey);
    if (user.phone) await this.redisService.del(`reset_otp:${user.phone}`);
    if (user.email)
      await this.redisService.del(`reset_otp:${user.email.toLowerCase()}`);

    this.logger.log(`Password successfully reset for user: ${user.email}`);

    return {
      success: true,
      message:
        'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Revoke refresh token and log out user.
   */
  async logout(userId?: string) {
    if (userId) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { refreshTokenHash: null },
        });
      } catch (err) {
        this.logger.warn(`Failed to clear refreshTokenHash for logout: ${err}`);
      }
    }
    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Helper to generate 15-min Access JWT and 7-day cryptographically hashed Refresh Token in PostgreSQL.
   */
  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    isVerified: boolean,
  ) {
    // 15-minute Access Token
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role, isVerified },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    // 7-day Refresh Token string
    const rawRefreshToken =
      crypto.randomBytes(40).toString('hex') + '.' + userId;

    // Argon2 hash saved in PostgreSQL
    const refreshTokenHash = await argon2.hash(rawRefreshToken);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 15 * 60, // seconds
    };
  }
}
