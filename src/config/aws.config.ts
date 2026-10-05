import { registerAs } from '@nestjs/config';

export default registerAs('awsS3', () => ({
  bucket: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
}));
