import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/**
 * Custom console log formatter with colors and clean timestamps
 */
const customConsoleFormat = printf(({ level, message, timestamp, context, ...meta }) => {
  const ctx = context ? ` [${context}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}${ctx}: ${message}${metaStr}`;
});

export function createWinstonLogger(serviceName: string = 'ShebaMitro') {
  const isProduction = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(
            colorize({ all: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            errors({ stack: true }),
            customConsoleFormat,
          ),
    }),
  ];

  return winston.createLogger({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    defaultMeta: { service: serviceName },
    transports,
    exitOnError: false,
  });
}

export const winstonLoggerInstance = createWinstonLogger();
