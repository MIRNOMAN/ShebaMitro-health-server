import { Controller, Get, Post, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { TestValidationDto } from './dto/test-validation.dto.js';

@ApiTags('Health & Demonstration')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'System Health Check' })
  @ResponseMessage('System health status fetched successfully')
  getHealth() {
    return {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('config-check')
  @ApiOperation({ summary: 'Verify loaded Zod validated configuration' })
  @ResponseMessage('Configuration validated successfully via Zod')
  getConfigCheck() {
    return {
      port: this.configService.get<number>('PORT'),
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      databaseConfigured: !!this.configService.get<string>('DATABASE_URL'),
      jwtSecretConfigured: !!this.configService.get<string>('JWT_SECRET'),
      redisHost: this.configService.get<string>('REDIS_HOST'),
      redisPort: this.configService.get<number>('REDIS_PORT'),
      awsS3Bucket: this.configService.get<string>('AWS_S3_BUCKET'),
      awsS3Region: this.configService.get<string>('AWS_S3_REGION'),
      bashAppKeyConfigured: !!this.configService.get<string>('BASH_APP_KEY'),
    };
  }

  @Post('test-validation')
  @ApiOperation({ summary: 'Test global ValidationPipe (strict whitelist & transform)' })
  @ResponseMessage('Validation successful')
  testValidation(@Body() dto: TestValidationDto) {
    return {
      validatedData: dto,
    };
  }

  @Get('test-rfc7807-error')
  @ApiOperation({ summary: 'Test RFC 7807 HttpExceptionFilter with custom exception' })
  testRfcError() {
    throw new BadRequestException('This is a test Bad Request error to verify RFC 7807 output');
  }

  @Get('test-404-error')
  @ApiOperation({ summary: 'Test RFC 7807 404 Not Found error' })
  testNotFoundError() {
    throw new NotFoundException('Requested resource was not found on this server');
  }
}
