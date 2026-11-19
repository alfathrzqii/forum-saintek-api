import { beforeEach, describe, expect, it } from 'bun:test';
import { gunzipSync, inflateSync } from 'node:zlib';
import { type Context, Elysia, t } from 'elysia';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/forum_saintek_test';

const { createApp } = await import('../../src/app.ts');
const { config } = await import('../../src/config/index.ts');
const { ClientError } = await import('../../src/exceptions/ClientError.ts');
const { InvariantError } = await import('../../src/exceptions/InvariantError.ts');
const { AuthenticationError } = await import('../../src/exceptions/AuthenticationError.ts');
const { AuthorizationError } = await import('../../src/exceptions/AuthorizationError.ts');
const { NotFoundError } = await import('../../src/exceptions/NotFoundError.ts');
const { formatResponse, successResponse } = await import('../../src/utils/response.ts');
const {
  uuidSchema,
  idParamSchema,
  threadIdParamSchema,
  commentIdParamSchema,
} = await import('../../src/validators/commonValidator.ts');
const { errorHandler } = await import('../../src/api/middlewares/errorHandler.ts');
const { authLimiter, resetRateLimiters } = await import(
  '../../src/api/middlewares/rateLimitMiddleware.ts'
);

const BACKEND_ROOT = new URL('../..', import.meta.url).pathname;

function runConfigSubprocess(env: Record<string, string>, code: string) {
  return Bun.spawnSync(['bun', '--no-env-file', '-e', code], {
    cwd: BACKEND_ROOT,
    env: {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('M2 Core Infrastructure', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  describe('Config & Fail-Fast Validation', () => {
    it('loads default values when optional environment variables are omitted', () => {
      const proc = runConfigSubprocess(
        {
          ACCESS_TOKEN_KEY: 'acc-key',
          REFRESH_TOKEN_KEY: 'ref-key',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        },
        "import { config } from './src/config/index.ts'; console.log(JSON.stringify(config));",
      );

      expect(proc.exitCode).toBe(0);
      const parsed = JSON.parse(proc.stdout.toString().trim());
      expect(parsed).toEqual({
        app: {
          port: 3000,
          nodeEnv: 'development',
          baseUrl: 'http://localhost',
          allowedOrigins: ['*'],
        },
        jwt: {
          accessTokenKey: 'acc-key',
          refreshTokenKey: 'ref-key',
          accessTokenAge: '15m',
        },
        db: {
          url: 'postgresql://localhost:5432/db',
        },
      });
    });

    it('parses custom PORT, NODE_ENV, BASE_URL, and comma-separated ALLOWED_ORIGINS', () => {
      const proc = runConfigSubprocess(
        {
          PORT: '4500',
          NODE_ENV: 'production',
          BASE_URL: 'https://api.example.com',
          ALLOWED_ORIGINS: 'https://a.example.com,https://b.example.com',
          ACCESS_TOKEN_KEY: 'acc-key',
          REFRESH_TOKEN_KEY: 'ref-key',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        },
        "import { config } from './src/config/index.ts'; console.log(JSON.stringify(config));",
      );

      expect(proc.exitCode).toBe(0);
      const parsed = JSON.parse(proc.stdout.toString().trim());
      expect(parsed.app).toEqual({
        port: 4500,
        nodeEnv: 'production',
        baseUrl: 'https://api.example.com',
        allowedOrigins: ['https://a.example.com', 'https://b.example.com'],
      });
    });

    it.each(['ACCESS_TOKEN_KEY', 'REFRESH_TOKEN_KEY', 'DATABASE_URL'] as const)(
      'exits with code 1 and logs fatal error when %s is missing',
      (missingKey) => {
        const env: Record<string, string> = {
          ACCESS_TOKEN_KEY: 'acc-key',
          REFRESH_TOKEN_KEY: 'ref-key',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        };
        delete env[missingKey];

        const proc = runConfigSubprocess(env, "import './src/config/index.ts';");
        const stderr = proc.stderr.toString();

        expect(proc.exitCode).toBe(1);
        expect(stderr).toContain(
          `[FATAL ERROR]: Variabel lingkungan "${missingKey}" tidak ditemukan!`,
        );
        expect(stderr).toContain(
          'Pastikan file .env sudah dikonfigurasi dengan benar.',
        );
      },
    );

    it('exposes loaded config in current process', () => {
      expect(config.jwt.accessTokenAge).toBe('15m');
      expect(typeof config.app.port).toBe('number');
    });

    it('configures pino logger level as debug in development and info otherwise', () => {
      const devProc = runConfigSubprocess(
        {
          NODE_ENV: 'development',
          ACCESS_TOKEN_KEY: 'acc-key',
          REFRESH_TOKEN_KEY: 'ref-key',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        },
        "import { logger } from './src/utils/logger.ts'; console.log(logger.level);",
      );
      expect(devProc.exitCode).toBe(0);
      expect(devProc.stdout.toString().trim()).toBe('debug');

      const prodProc = runConfigSubprocess(
        {
          NODE_ENV: 'production',
          ACCESS_TOKEN_KEY: 'acc-key',
          REFRESH_TOKEN_KEY: 'ref-key',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        },
        "import { logger } from './src/utils/logger.ts'; console.log(logger.level);",
      );
      expect(prodProc.exitCode).toBe(0);
      expect(prodProc.stdout.toString().trim()).toBe('info');
    });
  });

  describe('Exceptions Hierarchy', () => {
    it('constructs ClientError with default statusCode 400 and custom statusCode', () => {
      const defaultErr = new ClientError('Bad request');
      expect(defaultErr).toBeInstanceOf(Error);
      expect(defaultErr).toBeInstanceOf(ClientError);
      expect(defaultErr.name).toBe('ClientError');
      expect(defaultErr.statusCode).toBe(400);
      expect(defaultErr.message).toBe('Bad request');

      const customErr = new ClientError('Conflict', 409);
      expect(customErr.statusCode).toBe(409);
    });

    it('constructs InvariantError (400), AuthenticationError (401), AuthorizationError (403), and NotFoundError (404)', () => {
      const inv = new InvariantError('Input invalid');
      expect(inv).toBeInstanceOf(ClientError);
      expect(inv).toBeInstanceOf(InvariantError);
      expect(inv.name).toBe('InvariantError');
      expect(inv.statusCode).toBe(400);
      expect(inv.message).toBe('Input invalid');

      const auth = new AuthenticationError('Unauthorized');
      expect(auth).toBeInstanceOf(ClientError);
      expect(auth).toBeInstanceOf(AuthenticationError);
      expect(auth.name).toBe('AuthenticationError');
      expect(auth.statusCode).toBe(401);
      expect(auth.message).toBe('Unauthorized');

      const authz = new AuthorizationError('Forbidden');
      expect(authz).toBeInstanceOf(ClientError);
      expect(authz).toBeInstanceOf(AuthorizationError);
      expect(authz.name).toBe('AuthorizationError');
      expect(authz.statusCode).toBe(403);
      expect(authz.message).toBe('Forbidden');

      const notFound = new NotFoundError('Not found');
      expect(notFound).toBeInstanceOf(ClientError);
      expect(notFound).toBeInstanceOf(NotFoundError);
      expect(notFound.name).toBe('NotFoundError');
      expect(notFound.statusCode).toBe(404);
      expect(notFound.message).toBe('Not found');
    });
  });

  describe('Response Formatter', () => {
    it('omits data property when data is null or omitted', () => {
      const resDefault = formatResponse('success', 'OK');
      expect(resDefault).toEqual({ status: 'success', message: 'OK' });
      expect('data' in resDefault).toBe(false);

      const resNull = formatResponse('error', 'Failed', null);
      expect(resNull).toEqual({ status: 'error', message: 'Failed' });
      expect('data' in resNull).toBe(false);
    });

    it('includes data property when data is non-null (including falsy non-null values)', () => {
      expect(formatResponse('success', 'Found', { id: 1 })).toEqual({
        status: 'success',
        message: 'Found',
        data: { id: 1 },
      });
      expect(formatResponse('success', 'Empty list', [])).toEqual({
        status: 'success',
        message: 'Empty list',
        data: [],
      });
      expect(formatResponse('success', 'Zero', 0)).toEqual({
        status: 'success',
        message: 'Zero',
        data: 0,
      });
    });

    it('successResponse sets statusCode (default 200 and custom) and formats payload', () => {
      const setDefault: Pick<Context['set'], 'status'> = {};
      const bodyDefault = successResponse(setDefault, 'Fetched', { ok: true });
      expect(setDefault.status).toBe(200);
      expect(bodyDefault).toEqual({
        status: 'success',
        message: 'Fetched',
        data: { ok: true },
      });

      const setCreated: Pick<Context['set'], 'status'> = {};
      const bodyCreated = successResponse(setCreated, 'Created', null, 201);
      expect(setCreated.status).toBe(201);
      expect(bodyCreated).toEqual({ status: 'success', message: 'Created' });
      expect('data' in bodyCreated).toBe(false);
    });
  });

  describe('Common UUID Validators', () => {
    const validatorApp = new Elysia()
      .use(errorHandler)
      .get('/items/:id', ({ params }) => ({ ok: true, id: params.id }), {
        params: idParamSchema,
      })
      .get(
        '/threads/:threadId',
        ({ params }) => ({ ok: true, threadId: params.threadId }),
        { params: threadIdParamSchema },
      )
      .get(
        '/comments/:commentId',
        ({ params }) => ({ ok: true, commentId: params.commentId }),
        { params: commentIdParamSchema },
      )
      .post('/uuid-body', ({ body }) => ({ ok: true, id: body.id }), {
        body: t.Object({ id: uuidSchema }),
      });

    const validUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('accepts valid UUIDs across all commonValidator schemas', async () => {
      const r1 = await validatorApp.handle(
        new Request(`http://localhost/items/${validUuid}`),
      );
      expect(r1.status).toBe(200);

      const r2 = await validatorApp.handle(
        new Request(`http://localhost/threads/${validUuid}`),
      );
      expect(r2.status).toBe(200);

      const r3 = await validatorApp.handle(
        new Request(`http://localhost/comments/${validUuid}`),
      );
      expect(r3.status).toBe(200);

      const r4 = await validatorApp.handle(
        new Request('http://localhost/uuid-body', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: validUuid }),
        }),
      );
      expect(r4.status).toBe(200);
    });

    it('rejects invalid UUIDs with HTTP 400 and exact Indonesian message', async () => {
      for (const url of [
        'http://localhost/items/not-a-uuid',
        'http://localhost/threads/12345',
        'http://localhost/comments/invalid',
      ]) {
        const res = await validatorApp.handle(new Request(url));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          status: 'error',
          message: 'ID tidak valid (harus UUID)',
        });
      }

      const bodyRes = await validatorApp.handle(
        new Request('http://localhost/uuid-body', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'bad' }),
        }),
      );
      expect(bodyRes.status).toBe(400);
      expect(await bodyRes.json()).toEqual({
        status: 'error',
        message: 'ID tidak valid (harus UUID)',
      });
    });
  });

  describe('Global Error Handler', () => {
    const testApp = createApp()
      .get('/err/invariant', () => {
        throw new InvariantError('Data tidak valid');
      })
      .get('/err/auth', () => {
        throw new AuthenticationError('Token tidak valid');
      })
      .get('/err/authz', () => {
        throw new AuthorizationError('Akses ditolak');
      })
      .get('/err/notfound', () => {
        throw new NotFoundError('Resource tidak ada');
      })
      .get('/err/unexpected', () => {
        throw new Error('Database exploded internally');
      })
      .post(
        '/err/validate-custom',
        ({ body }) => body,
        {
          body: t.Object({
            username: t.String({
              minLength: 3,
              error: 'Username minimal 3 karakter',
            }),
          }),
        },
      )
      .post(
        '/err/validate-default',
        ({ body }) => body,
        {
          body: t.Object({
            title: t.String({ minLength: 5 }),
          }),
        },
      );

    it('maps all ClientError subclasses to their exact status codes and JSON shape', async () => {
      const cases = [
        { path: '/err/invariant', status: 400, message: 'Data tidak valid' },
        { path: '/err/auth', status: 401, message: 'Token tidak valid' },
        { path: '/err/authz', status: 403, message: 'Akses ditolak' },
        { path: '/err/notfound', status: 404, message: 'Resource tidak ada' },
      ];

      for (const c of cases) {
        const res = await testApp.handle(new Request(`http://localhost${c.path}`));
        expect(res.status).toBe(c.status);
        expect(await res.json()).toEqual({
          status: 'error',
          message: c.message,
        });
      }
    });

    it('forces VALIDATION errors to HTTP 400 and extracts a single concise message (never raw JSON)', async () => {
      const customRes = await testApp.handle(
        new Request('http://localhost/err/validate-custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ab' }),
        }),
      );
      expect(customRes.status).toBe(400);
      expect(await customRes.json()).toEqual({
        status: 'error',
        message: 'Username minimal 3 karakter',
      });

      const defaultRes = await testApp.handle(
        new Request('http://localhost/err/validate-default', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'hi' }),
        }),
      );
      expect(defaultRes.status).toBe(400);
      const defaultJson = (await defaultRes.json()) as {
        status: string;
        message: string;
      };
      expect(defaultJson.status).toBe('error');
      expect(typeof defaultJson.message).toBe('string');
      expect(defaultJson.message.length).toBeGreaterThan(0);
      expect(defaultJson.message.trim().startsWith('{')).toBe(false);
    });

    it('forces VALIDATION errors to HTTP 400 without raw JSON in NODE_ENV=production', () => {
      const script = `
        import { Elysia, t } from 'elysia';
        import { errorHandler } from './src/api/middlewares/errorHandler.ts';
        const app = new Elysia()
          .use(errorHandler)
          .post('/custom', ({ body }) => body, {
            body: t.Object({ name: t.String({ minLength: 3, error: 'Nama minimal 3 karakter' }) })
          })
          .post('/plain', ({ body }) => body, {
            body: t.Object({ title: t.String({ minLength: 5 }) })
          });
        const r1 = await app.handle(new Request('http://localhost/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'a' }),
        }));
        const r2 = await app.handle(new Request('http://localhost/plain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'x' }),
        }));
        console.log(JSON.stringify({
          s1: r1.status, b1: await r1.json(),
          s2: r2.status, b2: await r2.json(),
        }));
      `;

      const proc = runConfigSubprocess(
        {
          NODE_ENV: 'production',
          ACCESS_TOKEN_KEY: 'acc',
          REFRESH_TOKEN_KEY: 'ref',
          DATABASE_URL: 'postgresql://localhost:5432/db',
        },
        script,
      );

      expect(proc.exitCode).toBe(0);
      const result = JSON.parse(proc.stdout.toString().trim());
      expect(result.s1).toBe(400);
      expect(result.b1).toEqual({
        status: 'error',
        message: 'Nama minimal 3 karakter',
      });
      expect(result.s2).toBe(400);
      expect(result.b2.status).toBe('error');
      expect(result.b2.message.trim().startsWith('{')).toBe(false);
    });

    it('maps malformed JSON PARSE errors to HTTP 400', async () => {
      const res = await testApp.handle(
        new Request('http://localhost/err/validate-custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{invalid-json',
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        status: 'error',
        message: 'Format JSON tidak valid',
      });
    });

    it('maps unmatched routes (NOT_FOUND) to HTTP 404 including pathname and query string', async () => {
      const res = await testApp.handle(
        new Request('http://localhost/api/tidak-ada?foo=bar&page=2'),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        status: 'error',
        message: 'Rute /api/tidak-ada?foo=bar&page=2 tidak ditemukan',
      });
    });

    it('maps unexpected errors to HTTP 500 with generic Indonesian message', async () => {
      const res = await testApp.handle(
        new Request('http://localhost/err/unexpected'),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      });
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('sets draft-7 headers without legacy X-RateLimit-* headers and blocks after 100 global requests', async () => {
      const app = createApp();
      const headers = { 'cf-connecting-ip': '203.0.113.10' };

      const first = await app.handle(
        new Request('http://localhost/api', { headers }),
      );
      expect(first.status).toBe(200);
      expect(first.headers.get('ratelimit-policy')).toBe('100;w=900');
      expect(first.headers.get('ratelimit')).toMatch(
        /^limit=100, remaining=99, reset=\d+$/,
      );
      expect(first.headers.get('x-ratelimit-limit')).toBeNull();
      expect(first.headers.get('x-ratelimit-remaining')).toBeNull();
      expect(first.headers.get('x-ratelimit-reset')).toBeNull();

      for (let i = 2; i <= 100; i += 1) {
        const res = await app.handle(
          new Request('http://localhost/api', { headers }),
        );
        expect(res.status).toBe(200);
      }

      const blocked = await app.handle(
        new Request('http://localhost/api', { headers }),
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('ratelimit-policy')).toBe('100;w=900');
      expect(blocked.headers.get('ratelimit')).toMatch(
        /^limit=100, remaining=0, reset=\d+$/,
      );
      expect(await blocked.json()).toEqual({
        status: 'fail',
        message:
          'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit',
      });

      // Different IP via x-forwarded-for (first IP extracted) is not blocked
      const otherIp = await app.handle(
        new Request('http://localhost/api', {
          headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
        }),
      );
      expect(otherIp.status).toBe(200);
      expect(otherIp.headers.get('ratelimit')).toMatch(
        /^limit=100, remaining=99, reset=\d+$/,
      );
    });

    it('blocks authLimiter after 10 requests and resets via resetRateLimiters()', async () => {
      const authApp = new Elysia().post(
        '/api/authentications',
        () => ({ status: 'success' }),
        { beforeHandle: authLimiter },
      );

      const headers = { 'x-forwarded-for': '192.0.2.50, 10.0.0.2' };

      for (let i = 1; i <= 10; i += 1) {
        const res = await authApp.handle(
          new Request('http://localhost/api/authentications', {
            method: 'POST',
            headers,
          }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('ratelimit-policy')).toBe('10;w=3600');
        expect(res.headers.get('x-ratelimit-limit')).toBeNull();
      }

      const blocked = await authApp.handle(
        new Request('http://localhost/api/authentications', {
          method: 'POST',
          headers,
        }),
      );
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({
        status: 'fail',
        message:
          'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });

      resetRateLimiters();

      const afterReset = await authApp.handle(
        new Request('http://localhost/api/authentications', {
          method: 'POST',
          headers,
        }),
      );
      expect(afterReset.status).toBe(200);
      expect(afterReset.headers.get('ratelimit')).toMatch(
        /^limit=10, remaining=9, reset=\d+$/,
      );
    });
  });

  describe('App Endpoints, Swagger, Security, CORS & Compression', () => {
    it('serves GET /api welcome payload with security headers', async () => {
      const app = createApp();
      const res = await app.handle(new Request('http://localhost/api'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: 'Selamat datang di API Forum SAINTEK!, Server is running perfectly.',
        status: 'success',
      });
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('x-xss-protection')).toBe('0');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    });

    it('serves GET /api/health 200 on DB success and 503 on DB failure using DI', async () => {
      const healthyApp = createApp({
        checkDb: async () => [{ '?column?': 1 }],
      });
      const okRes = await healthyApp.handle(
        new Request('http://localhost/api/health'),
      );
      expect(okRes.status).toBe(200);
      const okJson = (await okRes.json()) as {
        status: string;
        message: string;
        data: { uptime: number; timestamp: string; database: string };
      };
      expect(okJson.status).toBe('success');
      expect(okJson.message).toBe('Sistem berjalan normal');
      expect(typeof okJson.data.uptime).toBe('number');
      expect(Number.isNaN(Date.parse(okJson.data.timestamp))).toBe(false);
      expect(okJson.data.database).toBe('connected');

      const failingApp = createApp({
        checkDb: async () => {
          throw new Error('ECONNREFUSED');
        },
      });
      const errRes = await failingApp.handle(
        new Request('http://localhost/api/health'),
      );
      expect(errRes.status).toBe(503);
      expect(await errRes.json()).toEqual({
        status: 'error',
        message: 'Sistem tidak sehat: Koneksi database terputus',
        details: 'ECONNREFUSED',
      });
    });

    it('serves Swagger UI at /api-docs (without restrictive CSP) and OpenAPI 3.0.0 spec with bearerAuth at /api-docs/json', async () => {
      const app = createApp();

      const uiRes = await app.handle(new Request('http://localhost/api-docs'));
      expect(uiRes.status).toBe(200);
      expect(uiRes.headers.get('content-type')).toContain('text/html');
      expect(uiRes.headers.get('content-security-policy')).toBeNull();
      const html = await uiRes.text();
      expect(html).toContain('SwaggerUIBundle');

      const jsonRes = await app.handle(
        new Request('http://localhost/api-docs/json'),
      );
      expect(jsonRes.status).toBe(200);
      const spec = (await jsonRes.json()) as {
        openapi: string;
        info: { title: string; version: string };
        servers: Array<{ url: string }>;
        components: { securitySchemes: Record<string, unknown> };
      };
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Forum SAINTEK API Documentation');
      expect(spec.info.version).toBe('1.0.0');
      expect(spec.servers.some((s) => s.url === 'https://api.forumsaintek.my.id/api')).toBe(
        true,
      );
      expect(spec.components.securitySchemes.bearerAuth).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it('handles CORS headers and OPTIONS preflight with security headers applied', async () => {
      const app = createApp();
      const allowedOrigin = config.app.allowedOrigins[0] === '*'
        ? 'http://localhost:5173'
        : config.app.allowedOrigins[0];

      const getRes = await app.handle(
        new Request('http://localhost/api', {
          headers: { Origin: allowedOrigin },
        }),
      );
      expect(getRes.status).toBe(200);
      expect(getRes.headers.get('access-control-allow-origin')).toBeTruthy();

      const preflightRes = await app.handle(
        new Request('http://localhost/api', {
          method: 'OPTIONS',
          headers: {
            Origin: allowedOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
          },
        }),
      );
      expect(preflightRes.status).toBe(204);
      expect(preflightRes.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(preflightRes.headers.get('access-control-allow-methods')).toContain(
        'POST',
      );
      expect(preflightRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(preflightRes.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    });

    it('compresses responses >= 1024 bytes when Accept-Encoding includes gzip or deflate and skips small payloads', async () => {
      const largePayload = { status: 'success', payload: 'x'.repeat(2048) };
      const app = createApp()
        .get('/large', () => largePayload)
        .get('/small', () => ({ ok: true }));

      const gzipRes = await app.handle(
        new Request('http://localhost/large', {
          headers: { 'Accept-Encoding': 'gzip, deflate' },
        }),
      );
      expect(gzipRes.status).toBe(200);
      expect(gzipRes.headers.get('content-encoding')).toBe('gzip');
      expect(gzipRes.headers.get('vary')).toContain('Accept-Encoding');
      const gzipBytes = new Uint8Array(await gzipRes.arrayBuffer());
      const decodedGzip = JSON.parse(
        Buffer.from(Bun.gunzipSync(gzipBytes)).toString('utf8'),
      );
      expect(decodedGzip).toEqual(largePayload);
      expect(
        JSON.parse(gunzipSync(gzipBytes).toString('utf8')),
      ).toEqual(largePayload);

      const deflateRes = await app.handle(
        new Request('http://localhost/large', {
          headers: { 'Accept-Encoding': 'deflate' },
        }),
      );
      expect(deflateRes.status).toBe(200);
      expect(deflateRes.headers.get('content-encoding')).toBe('deflate');
      const deflateBytes = new Uint8Array(await deflateRes.arrayBuffer());
      expect(deflateBytes[0]).toBe(0x78);
      const decodedDeflate = JSON.parse(
        inflateSync(deflateBytes).toString('utf8'),
      );
      expect(decodedDeflate).toEqual(largePayload);

      const smallRes = await app.handle(
        new Request('http://localhost/small', {
          headers: { 'Accept-Encoding': 'gzip' },
        }),
      );
      expect(smallRes.status).toBe(200);
      expect(smallRes.headers.get('content-encoding')).toBeNull();
      expect(await smallRes.json()).toEqual({ ok: true });
    });
  });
});
