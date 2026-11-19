import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { closeE2EDb, cleanupE2EData, deleteUserById } from './helpers/db.ts';
import {
  buildUserPayload,
  createAdminSession,
  createTracker,
  decodeJwtPayload,
  ipForGroup,
  loginUser,
  registerAndLogin,
  registerUser,
  uniqueId,
} from './helpers/fixtures.ts';
import { createHttpClient, type HttpClient } from './helpers/http.ts';
import { ensureE2EServer, type E2EServerHandle } from './helpers/server.ts';

let server: E2EServerHandle;
let baseClient: HttpClient;
const tracker = createTracker();

beforeAll(async () => {
  server = await ensureE2EServer();
  baseClient = createHttpClient(server.baseUrl);
});

afterAll(async () => {
  try {
    await cleanupE2EData(tracker);
  } finally {
    try {
      await closeE2EDb();
    } finally {
      if (server) {
        await server.stop();
      }
    }
  }
});

describe('Tier 1 — Core & Auth (F1–F5)', () => {
  describe('F1: Core Routes, Health Check, Swagger & 404', () => {
    const groupIp = ipForGroup(1, 1);

    it('T1-F1-01: GET /api returns 200 welcome message and CORS headers', async () => {
      const res = await baseClient.get('/api', {
        ip: groupIp,
        headers: { Origin: 'http://localhost:3000' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        message: 'Selamat datang di API Forum SAINTEK!, Server is running perfectly.',
      });
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('T1-F1-02: GET /api/health returns 200 with uptime, timestamp, and connected database', async () => {
      const res = await baseClient.get('/api/health', { ip: groupIp });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Sistem berjalan normal');
      expect(typeof res.body?.data?.uptime).toBe('number');
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof res.body?.data?.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.data.timestamp))).toBe(false);
      expect(res.body?.data?.database).toBe('connected');
    });

    it('T1-F1-03: GET /api-docs returns 200 HTML containing Swagger UI', async () => {
      const res = await baseClient.get('/api-docs', {
        ip: groupIp,
        redirect: 'follow',
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type') ?? '';
      expect(contentType.toLowerCase()).toContain('text/html');
      expect(res.rawText).toMatch(/swagger|Forum SAINTEK/i);
    });

    it('T1-F1-04: GET /api/unknown-route returns 404 JSON error envelope', async () => {
      const res = await baseClient.get('/api/unknown-route', { ip: groupIp });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Rute /api/unknown-route tidak ditemukan',
      });
    });

    it('T1-F1-05: OPTIONS /api/threads CORS preflight exposes allowed methods and headers', async () => {
      const res = await baseClient.request('OPTIONS', '/api/threads', {
        ip: groupIp,
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      expect([200, 204]).toContain(res.status);
      const allowedMethods = (res.headers.get('access-control-allow-methods') ?? '').toUpperCase();
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
        expect(allowedMethods).toContain(method);
      }

      const allowedHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
      expect(allowedHeaders).toContain('content-type');
      expect(allowedHeaders).toContain('authorization');
    });
  });

  describe('F2: Rate Limiting & Error Envelopes', () => {
    const groupIp = ipForGroup(1, 2);

    it('T1-F2-01: Standard request returns draft-7 RateLimit headers without legacy X-RateLimit-* headers', async () => {
      const res = await baseClient.get('/api', { ip: groupIp });

      expect(res.status).toBe(200);
      expect(res.headers.get('ratelimit')).toBeTruthy();
      expect(res.headers.get('ratelimit-policy')).toBeTruthy();

      const legacyHeaders = [...res.headers.keys()].filter((k) =>
        k.toLowerCase().startsWith('x-ratelimit-'),
      );
      expect(legacyHeaders).toEqual([]);
    });

    it('T1-F2-02: POST /api/authentications and POST /api/users emit authLimiter headers (limit=10, w=3600)', async () => {
      const authRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nonexistent_f2_02', password: 'wrongpassword' },
        { ip: '10.250.10.1' },
      );
      expect(authRes.headers.get('ratelimit')).toMatch(/\blimit=10\b/i);
      expect(authRes.headers.get('ratelimit-policy')).toMatch(/\b10\s*;\s*w=3600\b/i);

      const userRes = await baseClient.post(
        '/api/users',
        { email: 'bad' },
        { ip: '10.250.10.1' },
      );
      expect(userRes.headers.get('ratelimit')).toMatch(/\blimit=10\b/i);
      expect(userRes.headers.get('ratelimit-policy')).toMatch(/\b10\s*;\s*w=3600\b/i);
    });

    it('T1-F2-03: Distinct X-Forwarded-For IPs maintain independent authLimiter quotas', async () => {
      const ipA = '10.250.11.1';
      const ipB = '10.250.11.2';

      for (let i = 0; i < 10; i += 1) {
        const res = await baseClient.post(
          '/api/authentications',
          { identifier: 'nobody_f2_03', password: 'wrongpassword' },
          { ip: ipA },
        );
        expect(res.status).toBe(401);
      }

      const blockedRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_f2_03', password: 'wrongpassword' },
        { ip: ipA },
      );
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body?.status).toBe('fail');

      const ipBRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_f2_03', password: 'wrongpassword' },
        { ip: ipB },
      );
      expect(ipBRes.status).toBe(401);
      expect(ipBRes.body).toEqual({
        status: 'error',
        message: 'Kredensial tidak valid',
      });
    });

    it('T1-F2-04: Validation errors (400) return single-message error envelope without raw issues array', async () => {
      const res = await baseClient.post(
        '/api/users',
        { email: 'bad' },
        { ip: groupIp },
      );

      expect(res.status).toBe(400);
      expect(res.body).not.toBeNull();
      expect(Object.keys(res.body).sort()).toEqual(['message', 'status']);
      expect(res.body.status).toBe('error');
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
    });

    it('T1-F2-05: CF-Connecting-IP header is honored as a distinct rate-limit key when X-Forwarded-For is absent', async () => {
      const cfIpA = '10.250.12.1';
      const cfIpB = '10.250.12.2';

      for (let i = 0; i < 10; i += 1) {
        const res = await baseClient.post(
          '/api/authentications',
          { identifier: 'nobody_f2_05', password: 'wrongpassword' },
          { cfConnectingIp: cfIpA, omitForwardedFor: true },
        );
        expect(res.status).toBe(401);
      }

      const blockedRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_f2_05', password: 'wrongpassword' },
        { cfConnectingIp: cfIpA, omitForwardedFor: true },
      );
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body?.status).toBe('fail');

      const allowedRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_f2_05', password: 'wrongpassword' },
        { cfConnectingIp: cfIpB, omitForwardedFor: true },
      );
      expect(allowedRes.status).toBe(401);
    });
  });

  describe('F3: User Registration (POST /api/users)', () => {
    const groupIp = ipForGroup(1, 3);

    it('T1-F3-01: Valid registration returns 201 with user data and omits password', async () => {
      const { payload, user, response } = await registerUser(
        baseClient,
        tracker,
        {},
        groupIp,
      );

      expect(response.status).toBe(201);
      expect(response.body?.status).toBe('success');
      expect(response.body?.message).toBe('User berhasil didaftarkan');
      expect(user.id).toBeTruthy();
      expect(user.email).toBe(payload.email);
      expect(user.username).toBe(payload.username);
      expect(user.fullName).toBe(payload.fullName);
      expect(user.prodi).toBe(payload.prodi);
      expect(user.role).toBe('USER');
      expect(typeof user.createdAt).toBe('string');
      expect('password' in response.body.data).toBe(false);
    });

    it('T1-F3-02: Registered user can immediately authenticate via POST /api/authentications', async () => {
      const { payload } = await registerUser(baseClient, tracker, {}, groupIp);
      const loginRes = await loginUser(
        baseClient,
        tracker,
        payload.email,
        payload.password,
        groupIp,
      );

      expect(loginRes.response.status).toBe(201);
      expect(typeof loginRes.accessToken).toBe('string');
      expect(typeof loginRes.refreshToken).toBe('string');
    });

    it('T1-F3-03: Registration ignores mass-assigned role: ADMIN and creates USER', async () => {
      const payload = buildUserPayload();
      tracker.userEmails.push(payload.email);

      const res = await baseClient.post(
        '/api/users',
        { ...payload, role: 'ADMIN' },
        { ip: groupIp },
      );

      expect(res.status).toBe(201);
      if (res.body?.data?.id) {
        tracker.userIds.push(res.body.data.id);
      }
      expect(res.body?.data?.role).toBe('USER');
    });

    it('T1-F3-04: Subdomain university email (.student.uin-suka.ac.id) is accepted with 201', async () => {
      const email = `${uniqueId('sub')}@student.uin-suka.ac.id`;
      const { user, response } = await registerUser(
        baseClient,
        tracker,
        { email },
        groupIp,
      );

      expect(response.status).toBe(201);
      expect(user.email).toBe(email);
    });

    it('T1-F3-05: Username with underscores and digits is accepted with 201', async () => {
      const username = `mhs_saintek_2026_${uniqueId('u').slice(-6)}`;
      const { user, response } = await registerUser(
        baseClient,
        tracker,
        { username },
        groupIp,
      );

      expect(response.status).toBe(201);
      expect(user.username).toBe(username);
    });
  });

  describe('F4: Authentication Lifecycle (/api/authentications)', () => {
    it('T1-F4-01: Login with email identifier returns 201 and JWT pair with expected claims', async () => {
      const ip = ipForGroup(1, 4, 1);
      const { payload, user } = await registerUser(baseClient, tracker, {}, ip);
      const { accessToken, refreshToken, response } = await loginUser(
        baseClient,
        tracker,
        payload.email,
        payload.password,
        ip,
      );

      expect(response.status).toBe(201);
      expect(response.body?.status).toBe('success');
      expect(response.body?.message).toBe('Authentication berhasil ditambahkan');
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);

      const claims = decodeJwtPayload<{
        id: string;
        role: string;
        prodi: string;
        iat: number;
        exp: number;
      }>(accessToken);
      expect(claims.id).toBe(user.id);
      expect(claims.role).toBe('USER');
      expect(claims.prodi).toBe(payload.prodi);
      expect(typeof claims.iat).toBe('number');
      expect(typeof claims.exp).toBe('number');
    });

    it('T1-F4-02: Login with username identifier returns 201 with valid JWT pair', async () => {
      const ip = ipForGroup(1, 4, 2);
      const { payload, user } = await registerUser(baseClient, tracker, {}, ip);
      const { accessToken, refreshToken, response } = await loginUser(
        baseClient,
        tracker,
        payload.username,
        payload.password,
        ip,
      );

      expect(response.status).toBe(201);
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
      const claims = decodeJwtPayload<{ id: string }>(accessToken);
      expect(claims.id).toBe(user.id);
    });

    it('T1-F4-03: PUT /api/authentications refreshes accessToken usable on GET /api/users/me', async () => {
      const ip = ipForGroup(1, 4, 3);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const refreshRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: session.refreshToken },
        { ip },
      );

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body?.status).toBe('success');
      expect(refreshRes.body?.message).toBe('Access Token berhasil diperbarui');
      expect(typeof refreshRes.body?.data?.accessToken).toBe('string');

      const meRes = await baseClient.get('/api/users/me', {
        ip,
        token: refreshRes.body.data.accessToken,
      });
      expect(meRes.status).toBe(200);
      expect(meRes.body?.data?.id).toBe(session.user.id);
    });

    it('T1-F4-04: DELETE /api/authentications logs out with 200 and no data key', async () => {
      const ip = ipForGroup(1, 4, 4);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const logoutRes = await baseClient.del(
        '/api/authentications',
        { refreshToken: session.refreshToken },
        { ip },
      );

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({
        status: 'success',
        message: 'Refresh token berhasil dihapus (Logout berhasil)',
      });
      expect('data' in logoutRes.body).toBe(false);
    });

    it('T1-F4-05: Revoked refresh token cannot be reused in PUT /api/authentications', async () => {
      const ip = ipForGroup(1, 4, 5);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const logoutRes = await baseClient.del(
        '/api/authentications',
        { refreshToken: session.refreshToken },
        { ip },
      );
      expect(logoutRes.status).toBe(200);

      const reuseRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: session.refreshToken },
        { ip },
      );
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });
    });

    it('T1-F4-06: Newly issued accessToken from PUT /api/authentications works on protected F5 endpoints', async () => {
      const ip = ipForGroup(1, 4, 6);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      await Bun.sleep(1100);

      const refreshRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: session.refreshToken },
        { ip },
      );
      expect(refreshRes.status).toBe(200);
      const newAccessToken = refreshRes.body?.data?.accessToken as string;
      expect(typeof newAccessToken).toBe('string');

      const meRes = await baseClient.get('/api/users/me', {
        ip,
        token: newAccessToken,
      });
      expect(meRes.status).toBe(200);
      expect(meRes.body?.data?.id).toBe(session.user.id);
      expect(meRes.body?.data?.email).toBe(session.payload.email);

      const adminOnlyRes = await baseClient.get('/api/users', {
        ip,
        token: newAccessToken,
      });
      expect(adminOnlyRes.status).toBe(403);
    });
  });

  describe('F5: User Profile, Auth Middleware & RBAC', () => {
    it('T1-F5-01: GET /api/users/me returns authenticated profile omitting password and createdAt', async () => {
      const ip = ipForGroup(1, 5, 1);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const res = await baseClient.get('/api/users/me', {
        ip,
        token: session.accessToken,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        message: 'Profil berhasil dimuat',
        data: {
          id: session.user.id,
          email: session.payload.email,
          username: session.payload.username,
          fullName: session.payload.fullName,
          role: 'USER',
          prodi: session.payload.prodi,
        },
      });
      expect('password' in res.body.data).toBe(false);
      expect('createdAt' in res.body.data).toBe(false);
    });

    it('T1-F5-02: GET /api/users with ADMIN Bearer token returns 200 user list omitting passwords', async () => {
      const ip = ipForGroup(1, 5, 2);
      const admin = await createAdminSession(baseClient, tracker, {}, ip);

      const res = await baseClient.get('/api/users', {
        ip,
        token: admin.accessToken,
      });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Daftar user berhasil dimuat');
      expect(Array.isArray(res.body?.data)).toBe(true);

      const users = res.body.data as Array<Record<string, unknown>>;
      expect(users.some((u) => u.id === admin.user.id)).toBe(true);
      for (const u of users) {
        expect('password' in u).toBe(false);
      }
    });

    it('T1-F5-03: Protected route without Authorization header returns 401', async () => {
      const ip = ipForGroup(1, 5, 1);
      const res = await baseClient.get('/api/users/me', { ip });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });
    });

    it('T1-F5-04: GET /api/users with USER Bearer token returns 403', async () => {
      const ip = ipForGroup(1, 5, 3);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const res = await baseClient.get('/api/users', {
        ip,
        token: session.accessToken,
      });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
      });
    });

    it('T1-F5-05: Ghost User check rejects valid JWT with 401 after user row is deleted', async () => {
      const ip = ipForGroup(1, 5, 4);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      await deleteUserById(session.user.id);

      const res = await baseClient.get('/api/users/me', {
        ip,
        token: session.accessToken,
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });
    });
  });
});
