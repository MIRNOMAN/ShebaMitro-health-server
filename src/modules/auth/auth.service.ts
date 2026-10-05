import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Role } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
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

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.isVerified);

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
    const isPasswordValid = await argon2.verify(user.passwordHash, loginDto.password);

    if (!isPasswordValid) {
      const updatedAttempts = user.failedLoginAttempts + 1;
      let lockoutUntil: Date | null = null;

      if (updatedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        this.logger.warn(`Account locked due to 5 failed login attempts: ${user.email}`);
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

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.isVerified);

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
      throw new UnauthorizedException('Access denied. No valid refresh session.');
    }

    const isRefreshTokenValid = await argon2.verify(user.refreshTokenHash, rawRefreshToken);

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
   * Revoke refresh token and log out user.
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Logged out successfully' };
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
    const rawRefreshToken = crypto.randomBytes(40).toString('hex') + '.' + userId;

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
