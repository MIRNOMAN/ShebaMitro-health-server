import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Production Application (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
});
