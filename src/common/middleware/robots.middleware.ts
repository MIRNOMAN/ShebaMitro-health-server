import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export const ROBOTS_TXT_CONTENT = `User-agent: *\nDisallow: /\n`;

/**
 * Middleware to protect API documentation and the API server from search engine crawling.
 *
 * 1. Serves robots.txt at /robots.txt (and /api/v1/robots.txt) disallowing all search crawlers.
 * 2. Injects the 'X-Robots-Tag: noindex, nofollow' HTTP header for all /docs and /api/docs routes
 *    (as well as /robots.txt and root redirect) to prevent Google Search Console indexing issues.
 */
@Injectable()
export class RobotsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawUrl = req.originalUrl || req.path || req.url || '';
    const rawPath = rawUrl.split('?')[0];
    const normalizedPath = rawPath.toLowerCase().replace(/\/+$/, '') || '/';

    // 1. Serve robots.txt for search engines & crawlers
    if (
      normalizedPath === '/robots.txt' ||
      normalizedPath === '/api/v1/robots.txt'
    ) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).send(ROBOTS_TXT_CONTENT);
      return;
    }

    // 2. Prevent search indexing on all docs / Swagger / OpenAPI routes
    if (
      normalizedPath === '/docs' ||
      normalizedPath.startsWith('/docs/') ||
      normalizedPath.startsWith('/docs-') ||
      normalizedPath === '/api/docs' ||
      normalizedPath.startsWith('/api/docs/') ||
      normalizedPath.startsWith('/api/docs-') ||
      normalizedPath === '/api/v1/docs' ||
      normalizedPath.startsWith('/api/v1/docs/')
    ) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    // 3. Handle root route GET / (redirects to /docs with X-Robots-Tag)
    if (normalizedPath === '/' && req.method === 'GET') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.redirect(302, '/docs');
      return;
    }

    next();
  }
}

const defaultRobotsMiddleware = new RobotsMiddleware();

/**
 * Express-compatible functional middleware.
 */
export function robotsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  defaultRobotsMiddleware.use(req, res, next);
}
