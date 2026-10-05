import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { RedisService } from './../src/common/redis/redis.service';
import { PaginationService } from './../src/common/pagination/pagination.service';
import { PaginationBenchmarkService } from './../src/common/pagination/pagination.benchmark';

describe('Production Application (e2e)', () => {
  let app: INestApplication;

  const mockUsersDatabase: any[] = [];
  const mockDoctorProfilesDatabase: any[] = [
    {
      id: 'doc-1',
      userId: 'user-doc-1',
      name: 'Dr. Rahat Ali',
      specialization: 'Cardiology',
      qualifications: ['MBBS', 'FCPS'],
      experienceYears: 10,
      consultFee: 1000,
      followUpFee: 500,
      isApproved: true,
      bio: 'Expert Cardiologist in Dhaka',
      hospital: 'Square Hospital',
      gender: 'MALE',
      rating: 4.8,
      reviewCount: 45,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: 'user-doc-1', email: 'rahat@example.com', phone: '+8801711111111', isVerified: true },
      availabilities: [{ dayOfWeek: 'SUNDAY', startTime: '09:00', endTime: '17:00' }, { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }],
    },
    {
      id: 'doc-2',
      userId: 'user-doc-2',
      name: 'Dr. Nusrat Jahan',
      specialization: 'Neurology',
      qualifications: ['MBBS', 'MD'],
      experienceYears: 8,
      consultFee: 1500,
      followUpFee: 800,
      isApproved: true,
      bio: 'Experienced Neurologist at Labaid',
      hospital: 'Labaid Specialized Hospital',
      gender: 'FEMALE',
      rating: 4.9,
      reviewCount: 60,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: 'user-doc-2', email: 'nusrat@example.com', phone: '+8801722222222', isVerified: true },
      availabilities: [{ dayOfWeek: 'TUESDAY', startTime: '10:00', endTime: '16:00' }],
    },
    {
      id: 'doc-3',
      userId: 'user-doc-3',
      name: 'Dr. Tanvir Hossain',
      specialization: 'Cardiology',
      qualifications: ['MBBS'],
      experienceYears: 5,
      consultFee: 600,
      followUpFee: 300,
      isApproved: true,
      bio: 'Junior Cardiologist',
      hospital: 'Popular Diagnostic Center',
      gender: 'MALE',
      rating: 4.2,
      reviewCount: 15,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: 'user-doc-3', email: 'tanvir@example.com', phone: '+8801733333333', isVerified: true },
      availabilities: [],
    },
  ];

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
      findFirst: jest.fn(async ({ where }: { where: { email?: string; id?: string; phone?: string } }) => {
        if (where.email) {
          return mockUsersDatabase.find((u) => u.email === where.email && !u.deletedAt) || null;
        }
        if (where.id) {
          return mockUsersDatabase.find((u) => u.id === where.id && !u.deletedAt) || null;
        }
        if (where.phone) {
          return mockUsersDatabase.find((u) => u.phone === where.phone && !u.deletedAt) || null;
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
    doctorProfile: {
      findMany: jest.fn(async ({ where, skip = 0, take = 10 }: any) => {
        let results = mockDoctorProfilesDatabase.filter((d) => !d.deletedAt);

        if (where?.OR && Array.isArray(where.OR)) {
          results = results.filter((d) =>
            where.OR.some((cond: any) => {
              if (cond.name?.contains) {
                return d.name?.toLowerCase().includes(cond.name.contains.toLowerCase());
              }
              if (cond.bio?.contains) {
                return d.bio?.toLowerCase().includes(cond.bio.contains.toLowerCase());
              }
              if (cond.hospital?.contains) {
                return d.hospital?.toLowerCase().includes(cond.hospital.contains.toLowerCase());
              }
              if (cond.specialization?.contains) {
                return d.specialization?.toLowerCase().includes(cond.specialization.contains.toLowerCase());
              }
              return false;
            }),
          );
        }

        if (where?.consultFee) {
          if (where.consultFee.gte !== undefined) {
            results = results.filter((d) => d.consultFee >= where.consultFee.gte);
          }
          if (where.consultFee.lte !== undefined) {
            results = results.filter((d) => d.consultFee <= where.consultFee.lte);
          }
        }

        if (where?.rating?.gte !== undefined) {
          results = results.filter((d) => d.rating >= where.rating.gte);
        }

        if (where?.gender?.equals) {
          results = results.filter((d) => d.gender?.toLowerCase() === where.gender.equals.toLowerCase());
        }

        if (where?.availabilities?.some) {
          const targetDay = where.availabilities.some.dayOfWeek?.equals?.toLowerCase();
          results = results.filter((d) =>
            d.availabilities.some((a: any) => a.dayOfWeek.toLowerCase() === targetDay),
          );
        }

        return results.slice(skip, skip + take);
      }),
      count: jest.fn(async ({ where }: any) => {
        let results = mockDoctorProfilesDatabase.filter((d) => !d.deletedAt);

        if (where?.OR && Array.isArray(where.OR)) {
          results = results.filter((d) =>
            where.OR.some((cond: any) => {
              if (cond.name?.contains) {
                return d.name?.toLowerCase().includes(cond.name.contains.toLowerCase());
              }
              if (cond.bio?.contains) {
                return d.bio?.toLowerCase().includes(cond.bio.contains.toLowerCase());
              }
              if (cond.hospital?.contains) {
                return d.hospital?.toLowerCase().includes(cond.hospital.contains.toLowerCase());
              }
              if (cond.specialization?.contains) {
                return d.specialization?.toLowerCase().includes(cond.specialization.contains.toLowerCase());
              }
              return false;
            }),
          );
        }

        if (where?.consultFee) {
          if (where.consultFee.gte !== undefined) {
            results = results.filter((d) => d.consultFee >= where.consultFee.gte);
          }
          if (where.consultFee.lte !== undefined) {
            results = results.filter((d) => d.consultFee <= where.consultFee.lte);
          }
        }

        if (where?.rating?.gte !== undefined) {
          results = results.filter((d) => d.rating >= where.rating.gte);
        }

        if (where?.gender?.equals) {
          results = results.filter((d) => d.gender?.toLowerCase() === where.gender.equals.toLowerCase());
        }

        if (where?.availabilities?.some) {
          const targetDay = where.availabilities.some.dayOfWeek?.equals?.toLowerCase();
          results = results.filter((d) =>
            d.availabilities.some((a: any) => a.dayOfWeek.toLowerCase() === targetDay),
          );
        }

        return results.length;
      }),
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

  describe('OtpModule (Redis Rate Limit, 6-digit OTP, Verification & Claims)', () => {
    const testPhone = '+8801700112233';
    const rateLimitPhone = '+8801800112233';

    it('POST /auth/request-otp - should generate 6-digit OTP and set 3-min TTL in Redis', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ phone: testPhone })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('phone', testPhone);
      expect(response.body.data).toHaveProperty('ttlSeconds', 180);

      const redisService = app.get(RedisService);
      const storedOtp = await redisService.get(`otp:${testPhone}`);
      expect(storedOtp).toBeDefined();
      expect(storedOtp).toMatch(/^\d{6}$/);
    });

    it('POST /auth/request-otp - rate limit test (max 3 attempts per 10 minutes)', async () => {
      // 1st, 2nd, 3rd attempts succeed
      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/auth/request-otp')
          .send({ phone: rateLimitPhone })
          .expect(200);
      }

      // 4th attempt triggers 429 Too Many Requests
      const response = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ phone: rateLimitPhone })
        .expect(429);

      expect(response.body.detail || response.body.message).toContain('Maximum 3 attempts per 10 minutes allowed');
    });

    it('POST /auth/verify-otp - should fail with 400 when invalid code is submitted', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: testPhone, code: '000000' })
        .expect(400);

      expect(response.body.detail || response.body.message).toContain('Invalid or expired OTP code');
    });

    it('POST /auth/verify-otp - should verify valid OTP, update isVerified: true, and issue onboarding claims', async () => {
      const redisService = app.get(RedisService);
      const validCode = await redisService.get(`otp:${testPhone}`);
      expect(validCode).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: testPhone, code: validCode })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isVerified', true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.onboardingClaims).toEqual({
        isVerified: true,
        onboardingCompleted: true,
        canAccessOnboarding: true,
      });

      // OTP should be cleared from Redis after verification
      const clearedOtp = await redisService.get(`otp:${testPhone}`);
      expect(clearedOtp).toBeNull();
    });
  });

  describe('DoctorModule (GET /api/v1/doctors Search & Multi-Faceted Filtering)', () => {
    it('GET /doctors - should fetch all doctors with default offset pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('totalCount', 3);
      expect(response.body.data).toHaveProperty('totalPages', 1);
      expect(response.body.data).toHaveProperty('currentPage', 1);
      expect(response.body.data).toHaveProperty('hasNext', false);
    });

    it('GET /doctors?search=Rahat - should search by doctor name', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors?search=Rahat')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].name).toBe('Dr. Rahat Ali');
    });

    it('GET /doctors?specialty=Neurology - should filter by specialty', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors?specialty=Neurology')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].specialization).toBe('Neurology');
    });

    it('GET /doctors?minFee=500&maxFee=1200 - should filter by consult fee range', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors?minFee=500&maxFee=1200')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(2);
    });

    it('GET /doctors?ratingThreshold=4.8 - should filter by rating threshold', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors?ratingThreshold=4.8')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(2);
    });

    it('GET /doctors?gender=FEMALE - should filter by doctor gender', async () => {
      const response = await request(app.getHttpServer())
        .get('/doctors?gender=FEMALE')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].name).toBe('Dr. Nusrat Jahan');
    });
  });

  describe('PaginationService & Composite Cursor Pagination Benchmark', () => {
    let paginationService: PaginationService;
    let benchmarkService: PaginationBenchmarkService;

    beforeAll(() => {
      paginationService = app.get(PaginationService);
      benchmarkService = app.get(PaginationBenchmarkService);
    });

    it('should encode and decode base64 composite cursors [createdAt, id] correctly', () => {
      const now = new Date('2026-10-05T16:00:00.000Z');
      const id = 'uuid-9999-test';

      const cursorStr = paginationService.encodeCursor(now, id);
      expect(typeof cursorStr).toBe('string');
      expect(cursorStr.length).toBeGreaterThan(0);

      const decoded = paginationService.decodeCursor(cursorStr);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(id);
      expect(decoded?.createdAt.toISOString()).toBe(now.toISOString());
    });

    it('should return null when decoding invalid or malformed base64 cursor strings', () => {
      expect(paginationService.decodeCursor('')).toBeNull();
      expect(paginationService.decodeCursor('invalid_base64_string')).toBeNull();
    });

    it('should perform cursor pagination over model data returning pageInfo with startCursor and endCursor', async () => {
      const mockChatLogs = [
        { id: 'msg-3', createdAt: new Date('2026-10-05T16:03:00.000Z'), content: 'Hello 3' },
        { id: 'msg-2', createdAt: new Date('2026-10-05T16:02:00.000Z'), content: 'Hello 2' },
        { id: 'msg-1', createdAt: new Date('2026-10-05T16:01:00.000Z'), content: 'Hello 1' },
      ];

      const mockModel = {
        findMany: jest.fn(async () => mockChatLogs.slice(0, 2)),
      };

      const result = await paginationService.paginate(mockModel, {
        cursorDto: { limit: 2, direction: 'forward' as any },
      });

      expect(result).toHaveProperty('data');
      expect(result.data.length).toBe(2);
      expect(result).toHaveProperty('pageInfo');
      expect(result.pageInfo).toHaveProperty('startCursor');
      expect(result.pageInfo).toHaveProperty('endCursor');
      expect(result.pageInfo.startCursor).not.toBeNull();
      expect(result.pageInfo.endCursor).not.toBeNull();
    });

    it('should execute benchmark comparing composite cursor vs offset queries on 100,000 entities', async () => {
      const metrics = await benchmarkService.runBenchmark(100000);

      expect(metrics).toHaveProperty('datasetSize', 100000);
      expect(metrics).toHaveProperty('offsetPaginationMs');
      expect(metrics).toHaveProperty('cursorPaginationMs');
      expect(metrics).toHaveProperty('performanceGain');
      expect(metrics.cursorPaginationMs.ultraDeepPage10000).toBeDefined();
    });
  });
});
