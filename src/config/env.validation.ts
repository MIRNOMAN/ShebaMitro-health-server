import { z } from 'zod';

/**
 * Zod schema for validating environment variables at application startup.
 * Enforces strict presence and formats for PORT, DATABASE_URL, JWT_SECRET, REDIS_HOST, REDIS_PORT, AWS S3, and BASH_APP_KEY.
 */
export const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test', 'staging'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL environment variable is required.'),

  // JWT
  JWT_SECRET: z
    .string()
    .min(8, 'JWT_SECRET must be at least 8 characters long.'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Redis
  REDIS_HOST: z
    .string()
    .min(1, 'REDIS_HOST environment variable is required.')
    .default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),

  // AWS S3
  AWS_S3_BUCKET: z
    .string()
    .min(1, 'AWS_S3_BUCKET environment variable is required.'),
  AWS_S3_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z
    .string()
    .min(1, 'AWS_ACCESS_KEY_ID environment variable is required.'),
  AWS_SECRET_ACCESS_KEY: z
    .string()
    .min(1, 'AWS_SECRET_ACCESS_KEY environment variable is required.'),

  // Custom App Key
  BASH_APP_KEY: z
    .string()
    .min(1, 'BASH_APP_KEY environment variable is required.'),

  // CORS & Throttle
  CORS_ORIGIN: z.string().default('*'),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validation function used by @nestjs/config's `validate` property.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  → ${String(issue.path.join('.'))}: ${issue.message}`)
      .join('\n');

    throw new Error(`❌ Environment validation failed:\n${formatted}`);
  }

  return result.data;
}
