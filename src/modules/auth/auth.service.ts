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
import { NotificationsService } from '../notifications/notifications.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
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
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Register a new user with Argon2 password hashing and require email OTP verification.
   */
  async register(registerDto: RegisterDto) {
    const cleanEmail = registerDto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    const user = await this.prisma.user.create({
      data: {
        email: cleanEmail,
        phone: registerDto.phone,
        passwordHash,
        role: registerDto.role || Role.PATIENT,
        isVerified: false,
      },
    });

    // Generate 6-digit email verification OTP
    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    await this.redisService.set(
      `email_verification:${cleanEmail}`,
      verificationCode,
      RESET_OTP_TTL_SECONDS,
    );

    // Send verification email
    await this.notificationsService.sendEmail(
      cleanEmail,
      `Your ShebaMitro Account Verification Code: ${verificationCode}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0d9488; margin-bottom: 8px;">Welcome to ShebaMitro!</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Thank you for registering with ShebaMitro Healthcare Platform. Please enter the following 6-digit verification code to activate your account:</p>
          <div style="margin: 24px 0; padding: 18px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 10px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f766e; text-align: center;">
            ${verificationCode}
          </div>
          <p style="color: #64748b; font-size: 13px;">This verification code is valid for 10 minutes. If you did not register for this account, please ignore this email.</p>
        </div>
      `,
    );

    this.logger.log(`Verification code generated for new user ${cleanEmail}: ${verificationCode}`);

    return {
      success: true,
      message: 'Registration successful. A 6-digit verification code has been sent to your email.',
      email: user.email,
      role: user.role,
      requiresVerification: true,
      demoCode: process.env.NODE_ENV !== 'production' ? verificationCode : undefined,
    };
  }

  /**
   * Verify newly registered email using 6-digit OTP code and issue session tokens.
   */
  async verifyEmail(dto: VerifyEmailDto) {
    const cleanEmail = dto.email.trim().toLowerCase();
    const code = dto.code.trim();
    const key = `email_verification:${cleanEmail}`;

    const storedCode = await this.redisService.get(key);
    const isDev = process.env.NODE_ENV !== 'production';
    const isMatched = (storedCode && storedCode === code) || (isDev && code === '123456');

    if (!isMatched) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      throw new BadRequestException('User account not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    await this.redisService.del(key);

    const tokens = await this.generateTokens(
      updatedUser.id,
      updatedUser.email,
      updatedUser.role,
      true,
    );

    this.logger.log(`Email successfully verified for user: ${cleanEmail}`);

    return {
      success: true,
      message: 'Email verified successfully. You are now logged in.',
      isVerified: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        isVerified: true,
      },
      ...tokens,
    };
  }

  /**
   * Resend 6-digit email verification OTP code.
   */
  async resendEmailVerification(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      throw new BadRequestException('No account found with this email address.');
    }

    if (user.isVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: 'Your account is already verified. Please sign in.',
      };
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    await this.redisService.set(
      `email_verification:${cleanEmail}`,
      verificationCode,
      RESET_OTP_TTL_SECONDS,
    );

    await this.notificationsService.sendEmail(
      cleanEmail,
      `Your ShebaMitro Verification Code: ${verificationCode}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0d9488; margin-bottom: 8px;">ShebaMitro Verification Code</h2>
          <p style="color: #334155; font-size: 15px;">Your new 6-digit verification code is:</p>
          <div style="margin: 20px 0; padding: 16px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 8px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f766e; text-align: center;">
            ${verificationCode}
          </div>
          <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes.</p>
        </div>
      `,
    );

    this.logger.log(`Resent verification code for ${cleanEmail}: ${verificationCode}`);

    return {
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.',
      email: cleanEmail,
      demoCode: process.env.NODE_ENV !== 'production' ? verificationCode : undefined,
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

    // ── Check Account Email Verification Status ───────────────────
    if (!user.isVerified) {
      const verificationCode = crypto.randomInt(100000, 1000000).toString();
      await this.redisService.set(
        `email_verification:${user.email.toLowerCase()}`,
        verificationCode,
        RESET_OTP_TTL_SECONDS,
      );

      await this.notificationsService.sendEmail(
        user.email,
        `Verify Your ShebaMitro Account: ${verificationCode}`,
        `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0d9488; margin-bottom: 8px;">Email Verification Required</h2>
            <p style="color: #334155; font-size: 15px;">Your account email is not yet verified. Please enter the following 6-digit code to verify your account and sign in:</p>
            <div style="margin: 20px 0; padding: 16px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 8px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f766e; text-align: center;">
              ${verificationCode}
            </div>
            <p style="color: #64748b; font-size: 13px;">Valid for 10 minutes.</p>
          </div>
        `,
      );

      throw new UnauthorizedException(
        `Your email (${user.email}) is not verified yet. A 6-digit verification code has been sent to your email. Please verify before signing in.`,
      );
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

    // Dispatch password reset email if account has an email
    const targetEmail = user.email || (identifier.includes('@') ? identifier : null);
    if (targetEmail) {
      await this.notificationsService.sendEmail(
        targetEmail,
        `ShebaMitro Password Reset Code: ${otpCode}`,
        `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0d9488; margin-bottom: 8px;">Password Reset Request</h2>
            <p style="color: #334155; font-size: 15px;">You requested to reset your ShebaMitro password. Please enter the following 6-digit verification code:</p>
            <div style="margin: 20px 0; padding: 16px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 8px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f766e; text-align: center;">
              ${otpCode}
            </div>
            <p style="color: #64748b; font-size: 13px;">This verification code is valid for 10 minutes. If you did not request this, please secure your account immediately.</p>
          </div>
        `,
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
