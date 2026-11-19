import { deflateSync } from 'node:zlib';
import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import type { HealthCheckDb } from './api/controllers/healthController.ts';
import type { AuthMiddlewareDeps } from './api/middlewares/authenticationMiddleware.ts';
import { errorHandler } from './api/middlewares/errorHandler.ts';
import { globalLimiter } from './api/middlewares/rateLimitMiddleware.ts';
import { createAuthenticationRoutes } from './api/routes/authenticationRoutes.ts';
import { createHealthRoutes } from './api/routes/healthRoutes.ts';
import { createUserRoutes } from './api/routes/userRoutes.ts';
import { config } from './config/index.ts';
import type { AuthenticationService } from './services/authenticationService.ts';
import type { UserService } from './services/userService.ts';
import { logger } from './utils/logger.ts';
import { swaggerPlugin } from './utils/swagger.ts';

const COMPRESSION_THRESHOLD_BYTES = 1024;
const DEFAULT_CSP =
  "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests";

const requestStartTimes = new WeakMap<Request, number>();

export interface CreateAppOptions {
  checkDb?: HealthCheckDb;
  authenticationService?: AuthenticationService;
  userService?: UserService;
  authMiddlewareDeps?: AuthMiddlewareDeps;
}

export function createApp(options?: CreateAppOptions) {
  return new Elysia()
    .onRequest(({ request, set }) => {
      requestStartTimes.set(request, performance.now());

      const { pathname } = new URL(request.url);
      const isSwaggerDocs =
        pathname === '/api-docs' || pathname.startsWith('/api-docs/');

      set.headers['x-content-type-options'] = 'nosniff';
      set.headers['x-frame-options'] = 'SAMEORIGIN';
      set.headers['x-dns-prefetch-control'] = 'off';
      set.headers['x-download-options'] = 'noopen';
      set.headers['x-permitted-cross-domain-policies'] = 'none';
      set.headers['x-xss-protection'] = '0';
      set.headers['referrer-policy'] = 'no-referrer';
      set.headers['cross-origin-opener-policy'] = 'same-origin';
      set.headers['cross-origin-resource-policy'] = 'same-origin';
      set.headers['origin-agent-cluster'] = '?1';
      set.headers['strict-transport-security'] =
        'max-age=31536000; includeSubDomains';

      if (!isSwaggerDocs) {
        set.headers['content-security-policy'] = DEFAULT_CSP;
      }
    })
    .use(
      cors({
        origin: config.app.allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    )
    .onRequest(globalLimiter)
    .onAfterResponse({ as: 'global' }, ({ request, set }) => {
      const startTime = requestStartTimes.get(request);
      const responseTime =
        startTime !== undefined
          ? Math.round((performance.now() - startTime) * 100) / 100
          : 0;
      const url = new URL(request.url);
      const statusCode = typeof set.status === 'number' ? set.status : 200;

      logger.info(
        {
          req: {
            method: request.method,
            url: `${url.pathname}${url.search}`,
          },
          res: {
            statusCode,
          },
          responseTime,
        },
        'request completed',
      );
    })
    .mapResponse({ as: 'global' }, ({ request, responseValue, set }) => {
      const numericStatus = typeof set.status === 'number' ? set.status : 200;
      if (
        request.method === 'HEAD' ||
        numericStatus === 204 ||
        numericStatus === 304 ||
        request.headers.has('x-no-compression') ||
        set.headers['content-encoding']
      ) {
        return;
      }

      if (
        responseValue === null ||
        responseValue === undefined ||
        responseValue instanceof Response ||
        responseValue instanceof Blob ||
        responseValue instanceof ReadableStream
      ) {
        return;
      }

      const acceptEncoding = (
        request.headers.get('accept-encoding') ?? ''
      ).toLowerCase();

      const supportsGzip = acceptEncoding.includes('gzip');
      const supportsDeflate = acceptEncoding.includes('deflate');
      if (!supportsGzip && !supportsDeflate) {
        return;
      }

      let bodyString: string;
      let defaultContentType: string;

      if (typeof responseValue === 'string') {
        bodyString = responseValue;
        defaultContentType = 'text/plain; charset=utf-8';
      } else if (typeof responseValue === 'object') {
        bodyString = JSON.stringify(responseValue);
        defaultContentType = 'application/json; charset=utf-8';
      } else {
        return;
      }

      const rawBytes = Buffer.from(bodyString, 'utf8');
      if (rawBytes.byteLength < COMPRESSION_THRESHOLD_BYTES) {
        return;
      }

      const encoding = supportsGzip ? 'gzip' : 'deflate';
      const compressed =
        encoding === 'gzip'
          ? Bun.gzipSync(rawBytes)
          : deflateSync(rawBytes);

      const headers = new Headers();
      for (const [key, value] of Object.entries(set.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            headers.append(key, String(item));
          }
        } else {
          headers.set(key, String(value));
        }
      }

      if (!headers.has('content-type')) {
        headers.set('content-type', defaultContentType);
      }
      headers.set('content-encoding', encoding);
      headers.delete('content-length');

      const existingVary = headers.get('vary');
      if (!existingVary) {
        headers.set('vary', 'Accept-Encoding');
      } else if (
        existingVary.trim() !== '*' &&
        !existingVary
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .includes('accept-encoding')
      ) {
        headers.set('vary', `${existingVary}, Accept-Encoding`);
      }

      return new Response(Buffer.from(compressed), {
        status: numericStatus,
        headers,
      });
    })
    .use(errorHandler)
    .use(swaggerPlugin)
    .get(
      '/api',
      () => ({
        message: 'Selamat datang di API Forum SAINTEK!, Server is running perfectly.',
        status: 'success',
      }),
      {
        detail: {
          tags: ['General'],
          summary: 'Welcome message (Base API)',
        },
      },
    )
    .use(createHealthRoutes(options?.checkDb))
    .use(
      createAuthenticationRoutes({
        authenticationService: options?.authenticationService,
      }),
    )
    .use(
      createUserRoutes({
        userService: options?.userService,
        authMiddlewareDeps: options?.authMiddlewareDeps,
      }),
    );
}

export const app = createApp();

if (config.app.nodeEnv !== 'test' && import.meta.main) {
  app.listen(config.app.port, () => {
    logger.info(`Server running on port ${config.app.port}`);
  });
}

export default app;
