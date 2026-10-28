import { Request, Response, NextFunction } from 'express';
import {
  RobotsMiddleware,
  robotsMiddleware,
  ROBOTS_TXT_CONTENT,
} from './robots.middleware.js';

describe('RobotsMiddleware', () => {
  let middleware: RobotsMiddleware;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let headers: Record<string, string>;

  beforeEach(() => {
    middleware = new RobotsMiddleware();
    headers = {};
    mockReq = {
      path: '',
      originalUrl: '',
      url: '',
      method: 'GET',
    };
    mockRes = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
        return mockRes as Response;
      }),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('robots.txt serving', () => {
    it('should serve robots.txt at /robots.txt with Disallow: / and X-Robots-Tag', () => {
      mockReq.path = '/robots.txt';
      mockReq.originalUrl = '/robots.txt';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; charset=utf-8',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Robots-Tag',
        'noindex, nofollow',
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(ROBOTS_TXT_CONTENT);
      expect(ROBOTS_TXT_CONTENT).toContain('User-agent: *');
      expect(ROBOTS_TXT_CONTENT).toContain('Disallow: /');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should serve robots.txt at /api/v1/robots.txt', () => {
      mockReq.path = '/api/v1/robots.txt';
      mockReq.originalUrl = '/api/v1/robots.txt';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(ROBOTS_TXT_CONTENT);
      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should normalize paths with trailing slashes or queries for /robots.txt/', () => {
      mockReq.path = '/robots.txt/';
      mockReq.originalUrl = '/robots.txt/?v=1';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(ROBOTS_TXT_CONTENT);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('API Docs search indexing blocking', () => {
    it('should inject X-Robots-Tag: noindex, nofollow on /docs and call next()', () => {
      mockReq.path = '/docs';
      mockReq.originalUrl = '/docs';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Robots-Tag',
        'noindex, nofollow',
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should inject X-Robots-Tag on /docs/ (with trailing slash)', () => {
      mockReq.path = '/docs/';
      mockReq.originalUrl = '/docs/';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should inject X-Robots-Tag on /docs sub-assets like swagger-ui.css', () => {
      mockReq.path = '/docs/swagger-ui.css';
      mockReq.originalUrl = '/docs/swagger-ui.css';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should inject X-Robots-Tag on /docs-json and /docs-yaml', () => {
      mockReq.path = '/docs-json';
      mockReq.originalUrl = '/docs-json';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should inject X-Robots-Tag on legacy /api/docs routes', () => {
      mockReq.path = '/api/docs';
      mockReq.originalUrl = '/api/docs';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should inject X-Robots-Tag on /api/docs/swagger-ui-bundle.js', () => {
      mockReq.path = '/api/docs/swagger-ui-bundle.js';
      mockReq.originalUrl = '/api/docs/swagger-ui-bundle.js';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Root route handling', () => {
    it('should redirect GET / to /docs with X-Robots-Tag', () => {
      mockReq.path = '/';
      mockReq.originalUrl = '/';
      mockReq.method = 'GET';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(mockRes.redirect).toHaveBeenCalledWith(302, '/docs');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should not redirect non-GET / requests', () => {
      mockReq.path = '/';
      mockReq.originalUrl = '/';
      mockReq.method = 'POST';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Normal API endpoints pass-through', () => {
    it('should allow normal API requests to pass through untouched', () => {
      mockReq.path = '/api/v1/doctors';
      mockReq.originalUrl = '/api/v1/doctors';

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalled();
      expect(mockRes.send).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Functional robotsMiddleware helper', () => {
    it('should function identically when called directly as an Express middleware function', () => {
      mockReq.path = '/robots.txt';
      mockReq.originalUrl = '/robots.txt';

      robotsMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(ROBOTS_TXT_CONTENT);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

