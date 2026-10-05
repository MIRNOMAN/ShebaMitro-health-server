import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

describe('Production Application (e2e)', () => {
  let app: INestApplication;

  const mockUsersDatabase: any[] = [];

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return mockUsersDatabase.find((u) => u.email === where.email && !u.deletedAt) || null;
        }
        if (where.id) {
          return mockUsersDatabase.find((u) => u.id === where.id && !u.deletedAt) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return mockUsersDatabase.find((u) => u.email === where.email && !u.deletedAt) || null;
        }
        if (where.id) {
          return mockUsersDatabase.find((u) => u.id === where.id && !u.deletedAt) || null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newUser = {
          id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          email: data.email,
          phone: data.phone || null,
          passwordHash: data.passwordHash,
          role: data.role || 'PATIENT',
          isVerified: data.isVerified || false,
          refreshTokenHash: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockUsersDatabase.push(newUser);
        return newUser;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const idx = mockUsersDatabase.findIndex((u) => u.id === where.id);
        if (idx !== -1) {
          mockUsersDatabase[idx] = {
            ...mockUsersDatabase[idx],
            ...data,
            updatedAt: new Date(),
          };
          return mockUsersDatabase[idx];
        }
        return null;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('ApiResponseInterceptor', () => {
    it('/health (GET) should return standardized envelope { success, statusCode, data, message, timestamp }', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('statusCode', 200);
      expect(response.body).toHaveProperty('message', 'System health status fetched successfully');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Zod Environment Config', () => {
    it('/health/config-check (GET) should return validated Zod configuration values', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/config-check')
        .expect(200);

      expect(response.body.data).toEqual({
        port: 5010,
        nodeEnv: expect.stringMatching(/development|test/),
        databaseConfigured: true,
        jwtSecretConfigured: true,
        redisHost: '127.0.0.1',
        redisPort: 6379,
        awsS3Bucket: 'shebamitro-bucket',
        awsS3Region: 'us-east-1',
        bashAppKeyConfigured: true,
      });
    });
  });

  describe('Global ValidationPipe (strict whitelist & transform)', () => {
    it('should reject request with 400 when non-whitelisted fields are provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/health/test-validation')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          age: 25,
          unknownField: 'hack', // Should trigger forbidNonWhitelisted
        })
        .expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should accept valid request payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/health/test-validation')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          age: 25,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.validatedData).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      });
    });
  });

  describe('Centralized RFC 7807 HttpExceptionFilter', () => {
    it('should return RFC 7807 problem details for custom exceptions', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/test-rfc7807-error')
        .expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toEqual({
        type: 'https://httpstatuses.com/400',
        title: 'Bad Request',
        status: 400,
        detail: 'This is a test Bad Request error to verify RFC 7807 output',
        instance: '/health/test-rfc7807-error',
        timestamp: expect.any(String),
      });
    });

    it('should return RFC 7807 problem details for 404 errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/test-404-error')
        .expect(404);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toEqual({
        type: 'https://httpstatuses.com/404',
        title: 'Not Found',
        status: 404,
        detail: 'Requested resource was not found on this server',
        instance: '/health/test-404-error',
        timestamp: expect.any(String),
      });
    });
  });

  describe('AuthModule (Argon2, Cookies, Refresh Tokens & Account Lockout)', () => {
    const testUser = {
      email: `test_user_${Date.now()}@example.com`,
      password: 'StrongArgon2Password123!',
      phone: '+8801711223344',
    };

    let refreshToken: string;
    let accessToken: string;

    it('POST /auth/register - should create user with Argon2 hash & set HttpOnly cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');

      const cookies = response.get('Set-Cookie');
      expect(cookies).toBeDefined();
      const hasAccessTokenCookie = cookies.some((c: string) => c.includes('access_token='));
      const hasRefreshTokenCookie = cookies.some((c: string) => c.includes('refresh_token='));
      expect(hasAccessTokenCookie).toBe(true);
      expect(hasRefreshTokenCookie).toBe(true);

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('POST /auth/login - should authenticate user with correct Argon2 password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('Account Lockout - 5 consecutive wrong password attempts should trigger lockout', async () => {
      const lockoutUser = {
        email: `lockout_${Date.now()}@example.com`,
        password: 'CorrectPassword123!',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(lockoutUser)
        .expect(201);

      // Attempt 1 to 4 with wrong password
      for (let i = 1; i <= 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: lockoutUser.email,
            password: 'WrongPassword!',
          })
          .expect(401);
      }

      // 5th attempt triggers 403 Forbidden Lockout
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: lockoutUser.email,
          password: 'WrongPassword!',
        })
        .expect(403);

      expect(response.body.detail || response.body.message).toContain('Account locked');
    });

    it('POST /auth/refresh - should rotate access and refresh tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('POST /auth/logout - should clear refresh tokens and auth cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const cookies = response.get('Set-Cookie');
      if (cookies) {
        const clearedAccessToken = cookies.some((c: string) => c.includes('access_token=;'));
        expect(clearedAccessToken).toBe(true);
      }
    });
  });

  describe('RolesGuard & @CurrentUser Decorator', () => {
    let adminAccessToken: string;
    let patientAccessToken: string;

    beforeAll(async () => {
      // Register Admin user
      const adminRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `admin_${Date.now()}@shebamitro.com`,
          password: 'AdminPassword123!',
          role: 'ADMIN',
        });
      adminAccessToken = adminRes.body.data.accessToken;

      // Register Patient user
      const patientRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `patient_${Date.now()}@shebamitro.com`,
          password: 'PatientPassword123!',
          role: 'PATIENT',
        });
      patientAccessToken = patientRes.body.data.accessToken;
    });

    it('GET /health/admin-only - should allow user with ADMIN role', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/admin-only')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('userRole', 'ADMIN');
      expect(response.body.data).toHaveProperty('userId');
    });

    it('GET /health/admin-only - should deny user with PATIENT role (403 Forbidden)', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/admin-only')
        .set('Authorization', `Bearer ${patientAccessToken}`)
        .expect(403);

      expect(response.body.detail || response.body.message).toContain('Access denied');
    });

    it('GET /users/me - should extract current authenticated user profile using @CurrentUser()', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data).toHaveProperty('profile');
    });
  });
});
