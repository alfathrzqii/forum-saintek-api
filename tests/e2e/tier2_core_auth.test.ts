import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { closeE2EDb, cleanupE2EData } from './helpers/db.ts';
import {
  buildUserPayload,
  createAdminSession,
  createModeratorSession,
  createTracker,
  ipForGroup,
  loginUser,
  mintExpiredAccessToken,
  registerAndLogin,
  registerUser,
  signHs256Jwt,
  uniqueId,
} from './helpers/fixtures.ts';
import {
  createHttpClient,
  type HttpClient,
  type HttpResponse,
} from './helpers/http.ts';
import {
  ensureE2EServer,
  startUnhealthyE2EServer,
  type E2EServerHandle,
} from './helpers/server.ts';

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

describe('Tier 2 — Core & Auth Boundary & Corner Cases (F1–F5)', () => {
  describe('F1: Core, Health, Docs & 404 Boundaries', () => {
    const groupIp = ipForGroup(2, 1);

    it('T2-F1-01: 404 message preserves full query string', async () => {
      const res = await baseClient.get('/api/nonexistent?foo=bar&x=1', {
        ip: groupIp,
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Rute /api/nonexistent?foo=bar&x=1 tidak ditemukan',
      });
    });

    it('T2-F1-02: Unsupported HTTP method on valid paths returns 404 JSON error', async () => {
      const patchHealth = await baseClient.request('PATCH', '/api/health', {
        ip: groupIp,
      });
      expect(patchHealth.status).toBe(404);
      expect(patchHealth.body?.status).toBe('error');
      expect(typeof patchHealth.body?.message).toBe('string');
      expect(patchHealth.body.message.length).toBeGreaterThan(0);

      const deleteSubforums = await baseClient.del('/api/subforums', undefined, {
        ip: groupIp,
      });
      expect(deleteSubforums.status).toBe(404);
      expect(deleteSubforums.body?.status).toBe('error');
      expect(typeof deleteSubforums.body?.message).toBe('string');
      expect(deleteSubforums.body.message.length).toBeGreaterThan(0);
    });

    it('T2-F1-03: GET /api-docs.json returns 404', async () => {
      const res = await baseClient.get('/api-docs.json', { ip: groupIp });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Rute /api-docs.json tidak ditemukan',
      });
    });

    it(
      'T2-F1-04: GET /api/health returns 503 with error details when database is unreachable',
      async () => {
        const unhealthyServer = await startUnhealthyE2EServer();
        try {
          const unhealthyClient = createHttpClient(unhealthyServer.baseUrl);
          const res = await unhealthyClient.get('/api/health', { ip: groupIp });

          expect(res.status).toBe(503);
          expect(res.body?.status).toBe('error');
          expect(res.body?.message).toBe(
            'Sistem tidak sehat: Koneksi database terputus',
          );
          expect(typeof res.body?.details).toBe('string');
          expect(res.body.details.length).toBeGreaterThan(0);
        } finally {
          await unhealthyServer.stop();
        }
      },
      20_000,
    );

    it('T2-F1-05: Security headers (Helmet equivalents) are present on API responses', async () => {
      const res = await baseClient.get('/api', { ip: groupIp });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');

      const securityHeaders = [
        'x-frame-options',
        'content-security-policy',
        'referrer-policy',
        'x-dns-prefetch-control',
        'cross-origin-opener-policy',
      ];
      expect(
        securityHeaders.some((headerName) => res.headers.get(headerName) !== null),
      ).toBe(true);
    });
  });

  describe('F2: Rate Limiting & Error Envelope Boundaries', () => {
    const groupIp = ipForGroup(2, 2);

    it('T2-F2-01: authLimiter allows 1..10 requests and rejects 11th with 429', async () => {
      const dedicatedIp = '10.250.21.1';

      for (let i = 0; i < 10; i += 1) {
        const res = await baseClient.post(
          '/api/authentications',
          { identifier: 'nobody_t2_f2_01', password: 'wrongpassword' },
          { ip: dedicatedIp },
        );
        expect(res.status).toBe(401);
      }

      const eleventh = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_t2_f2_01', password: 'wrongpassword' },
        { ip: dedicatedIp },
      );
      expect(eleventh.status).toBe(429);
      expect(eleventh.body).toEqual({
        status: 'fail',
        message: 'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });
      expect(eleventh.headers.get('ratelimit')).toBeTruthy();
      expect(eleventh.headers.get('ratelimit-policy')).toBeTruthy();
    });

    it('T2-F2-02: Validation failures (400) count toward authLimiter quota', async () => {
      const dedicatedIp = '10.250.22.1';

      for (let i = 0; i < 10; i += 1) {
        const res = await baseClient.post(
          '/api/users',
          { email: 'bad' },
          { ip: dedicatedIp },
        );
        expect(res.status).toBe(400);
      }

      const validPayload = buildUserPayload();
      const eleventh = await baseClient.post('/api/users', validPayload, {
        ip: dedicatedIp,
      });
      expect(eleventh.status).toBe(429);
      expect(eleventh.body).toEqual({
        status: 'fail',
        message: 'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });
    });

    it(
      'T2-F2-03: globalLimiter allows 100 requests and rejects 101st with 429',
      async () => {
        const dedicatedIp = '10.250.23.1';

        for (let i = 0; i < 100; i += 1) {
          const res = await baseClient.get('/api', { ip: dedicatedIp });
          expect(res.status).toBe(200);
        }

        const res101 = await baseClient.get('/api', { ip: dedicatedIp });
        expect(res101.status).toBe(429);
        expect(res101.body).toEqual({
          status: 'fail',
          message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit',
        });
      },
      20_000,
    );

    it('T2-F2-04: Malformed JSON body returns clean error JSON without crashing server', async () => {
      const res = await baseClient.post('/api/authentications', undefined, {
        ip: groupIp,
        rawBody: '{bad-json',
      });

      expect([400, 500]).toContain(res.status);
      expect(res.body?.status).toBe('error');
      expect(typeof res.body?.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);

      const healthRes = await baseClient.get('/api/health', { ip: groupIp });
      expect(healthRes.status).toBe(200);
    });

    it('T2-F2-05: RateLimit header decrements remaining quota across consecutive requests', async () => {
      const dedicatedIp = '10.250.25.1';

      const parseRemaining = (headerValue: string | null): number => {
        expect(headerValue).toBeTruthy();
        const match = headerValue?.match(/remaining=(\d+)/i);
        expect(match).not.toBeNull();
        return Number.parseInt(match![1]!, 10);
      };

      const r1 = await baseClient.get('/api', { ip: dedicatedIp });
      const r2 = await baseClient.get('/api', { ip: dedicatedIp });
      const r3 = await baseClient.get('/api', { ip: dedicatedIp });

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(200);

      const rem1 = parseRemaining(r1.headers.get('ratelimit'));
      const rem2 = parseRemaining(r2.headers.get('ratelimit'));
      const rem3 = parseRemaining(r3.headers.get('ratelimit'));

      expect(rem1).toBeGreaterThan(rem2);
      expect(rem2).toBeGreaterThan(rem3);
    });

    it('T2-F2-06: Empty body on JSON endpoints returns 400 error envelope cleanly', async () => {
      const authEmptyObj = await baseClient.post('/api/authentications', {}, { ip: groupIp });
      expect(authEmptyObj.status).toBe(400);
      expect(authEmptyObj.body?.status).toBe('error');
      expect(typeof authEmptyObj.body?.message).toBe('string');
      expect(authEmptyObj.body.message.length).toBeGreaterThan(0);

      const userEmptyObj = await baseClient.post('/api/users', {}, { ip: groupIp });
      expect(userEmptyObj.status).toBe(400);
      expect(userEmptyObj.body?.status).toBe('error');
      expect(typeof userEmptyObj.body?.message).toBe('string');
      expect(userEmptyObj.body.message.length).toBeGreaterThan(0);
    });
  });

  describe('F3: User Registration Boundaries (POST /api/users)', () => {
    it('T2-F3-01: Non-.ac.id email is rejected with 400', async () => {
      const ip = ipForGroup(2, 3, 1);
      const payload = buildUserPayload({ email: `${uniqueId('gmail')}@gmail.com` });

      const res = await baseClient.post('/api/users', payload, { ip });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Email harus menggunakan domain universitas (.ac.id)',
      });
    });

    it('T2-F3-02: Uppercase .AC.ID domain and malformed email are rejected with 400', async () => {
      const ip = ipForGroup(2, 3, 2);

      const upperRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ email: `${uniqueId('upper')}@STUDENT.UIN-SUKA.AC.ID` }),
        { ip },
      );
      expect(upperRes.status).toBe(400);
      expect(upperRes.body).toEqual({
        status: 'error',
        message: 'Email harus menggunakan domain universitas (.ac.id)',
      });

      const malformedRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ email: 'not-an-email' }),
        { ip },
      );
      expect(malformedRes.status).toBe(400);
      expect(malformedRes.body).toEqual({
        status: 'error',
        message: 'Format email tidak valid',
      });
    });

    it('T2-F3-03: Username length boundary rejects 2 chars (400) and accepts 3 chars (201)', async () => {
      const ip = ipForGroup(2, 3, 3);

      const shortRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ username: 'ab' }),
        { ip },
      );
      expect(shortRes.status).toBe(400);
      expect(shortRes.body).toEqual({
        status: 'error',
        message: 'Username minimal 3 karakter',
      });

      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let createdRes: HttpResponse | undefined;
      let threeCharUsername = '';

      for (let attempt = 0; attempt < 3; attempt += 1) {
        threeCharUsername =
          chars[Math.floor(Math.random() * chars.length)]! +
          chars[Math.floor(Math.random() * chars.length)]! +
          chars[Math.floor(Math.random() * chars.length)]!;

        const payload = buildUserPayload({ username: threeCharUsername });
        const res = await baseClient.post('/api/users', payload, { ip });
        if (
          res.status === 400 &&
          res.body?.message === 'Username sudah digunakan' &&
          attempt < 2
        ) {
          continue;
        }
        createdRes = res;
        if (res.status === 201 && res.body?.data?.id) {
          tracker.userIds.push(res.body.data.id);
          tracker.userEmails.push(payload.email);
        }
        break;
      }

      expect(createdRes?.status).toBe(201);
      expect(createdRes?.body?.data?.username).toBe(threeCharUsername);
      expect(createdRes?.body?.data?.username?.length).toBe(3);
    });

    it('T2-F3-04: Username with invalid characters (hyphen, space, symbol) returns 400', async () => {
      const ip = ipForGroup(2, 3, 4);

      for (const badUsername of ['user-name', 'user name', 'user@1']) {
        const res = await baseClient.post(
          '/api/users',
          buildUserPayload({ username: badUsername }),
          { ip },
        );
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          status: 'error',
          message: 'Username hanya boleh berisi huruf, angka, dan underscore',
        });
      }
    });

    it('T2-F3-05: Password length boundary rejects 7 chars (400) and accepts 8 chars (201)', async () => {
      const ip = ipForGroup(2, 3, 5);

      const shortRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ password: '1234567' }),
        { ip },
      );
      expect(shortRes.status).toBe(400);
      expect(shortRes.body).toEqual({
        status: 'error',
        message: 'Password minimal 8 karakter',
      });

      const { response } = await registerUser(
        baseClient,
        tracker,
        { password: '12345678' },
        ip,
      );
      expect(response.status).toBe(201);
    });

    it('T2-F3-06: Duplicate email, duplicate username, and both duplicate return exact 400 errors', async () => {
      const ip = ipForGroup(2, 3, 6);
      const { payload } = await registerUser(baseClient, tracker, {}, ip);

      const dupEmailRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ email: payload.email }),
        { ip },
      );
      expect(dupEmailRes.status).toBe(400);
      expect(dupEmailRes.body).toEqual({
        status: 'error',
        message: 'Email sudah digunakan',
      });

      const dupUsernameRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ username: payload.username }),
        { ip },
      );
      expect(dupUsernameRes.status).toBe(400);
      expect(dupUsernameRes.body).toEqual({
        status: 'error',
        message: 'Username sudah digunakan',
      });

      const dupBothRes = await baseClient.post(
        '/api/users',
        buildUserPayload({
          email: payload.email,
          username: payload.username,
        }),
        { ip },
      );
      expect(dupBothRes.status).toBe(400);
      expect(dupBothRes.body).toEqual({
        status: 'error',
        message: 'Email sudah digunakan',
      });
    });

    it('T2-F3-07: fullName min length, prodi min length, and omitted fullName parity check', async () => {
      const ip = ipForGroup(2, 3, 7);

      const shortNameRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ fullName: 'Ab' }),
        { ip },
      );
      expect(shortNameRes.status).toBe(400);
      expect(shortNameRes.body).toEqual({
        status: 'error',
        message: 'Nama lengkap minimal 3 karakter',
      });

      const shortProdiRes = await baseClient.post(
        '/api/users',
        buildUserPayload({ prodi: 'A' }),
        { ip },
      );
      expect(shortProdiRes.status).toBe(400);
      expect(shortProdiRes.body).toEqual({
        status: 'error',
        message: 'Prodi harus diisi',
      });

      const omittedPayload = buildUserPayload();
      tracker.userEmails.push(omittedPayload.email);
      const { fullName: _omitted, ...withoutFullName } = omittedPayload;

      const omittedRes = await baseClient.post('/api/users', withoutFullName, {
        ip,
      });
      expect(omittedRes.status).toBe(500);
      expect(omittedRes.body).toEqual({
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      });
    });
  });

  describe('F4: Authentication Lifecycle Boundaries', () => {
    it('T2-F4-01: Legacy { email, password } payload without identifier is rejected with 400', async () => {
      const ip = ipForGroup(2, 4, 1);
      const res = await baseClient.post(
        '/api/authentications',
        { email: 'legacy@student.uin-suka.ac.id', password: 'Password123!' },
        { ip },
      );

      expect(res.status).toBe(400);
      expect(res.body?.status).toBe('error');
      expect(typeof res.body?.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
    });

    it('T2-F4-02: identifier min(3) and empty password validation return exact 400 errors', async () => {
      const ip = ipForGroup(2, 4, 2);

      const shortIdentifierRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'ab', password: 'Password123!' },
        { ip },
      );
      expect(shortIdentifierRes.status).toBe(400);
      expect(shortIdentifierRes.body).toEqual({
        status: 'error',
        message: 'Email atau username minimal 3 karakter',
      });

      const emptyPasswordRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'abc', password: '' },
        { ip },
      );
      expect(emptyPasswordRes.status).toBe(400);
      expect(emptyPasswordRes.body).toEqual({
        status: 'error',
        message: 'Password harus diisi',
      });
    });

    it('T2-F4-03: Wrong password and unknown identifier both return 401 Kredensial tidak valid', async () => {
      const ip = ipForGroup(2, 4, 3);
      const { payload } = await registerUser(baseClient, tracker, {}, ip);

      const wrongPwdRes = await baseClient.post(
        '/api/authentications',
        { identifier: payload.email, password: 'WrongPassword123!' },
        { ip },
      );
      expect(wrongPwdRes.status).toBe(401);
      expect(wrongPwdRes.body).toEqual({
        status: 'error',
        message: 'Kredensial tidak valid',
      });

      const unknownRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nonexistent_e2e_user', password: 'Password123!' },
        { ip },
      );
      expect(unknownRes.status).toBe(401);
      expect(unknownRes.body).toEqual({
        status: 'error',
        message: 'Kredensial tidak valid',
      });
    });

    it('T2-F4-04: PUT /api/authentications rejects valid-format JWT not stored in DB with 400', async () => {
      const ip = ipForGroup(2, 4, 4);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const withAccessTokenRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: session.accessToken },
        { ip },
      );
      expect(withAccessTokenRes.status).toBe(400);
      expect(withAccessTokenRes.body).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });

      const forgedJwt = signHs256Jwt({ id: session.user.id }, 'wrong_secret');
      const withForgedRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: forgedJwt },
        { ip },
      );
      expect(withForgedRes.status).toBe(400);
      expect(withForgedRes.body).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });
    });

    it('T2-F4-05: Empty refreshToken on PUT and unknown refreshToken on DELETE return 400', async () => {
      const ip = ipForGroup(2, 4, 5);

      const emptyPutRes = await baseClient.put(
        '/api/authentications',
        { refreshToken: '' },
        { ip },
      );
      expect(emptyPutRes.status).toBe(400);
      expect(emptyPutRes.body).toEqual({
        status: 'error',
        message: 'Refresh token harus ada',
      });

      const unknownDelRes = await baseClient.del(
        '/api/authentications',
        { refreshToken: 'unknown_token_value' },
        { ip },
      );
      expect(unknownDelRes.status).toBe(400);
      expect(unknownDelRes.body).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });
    });

    it('T2-F4-06: Two logins >1s apart isolate sessions; revoking one leaves the other valid', async () => {
      const ip = ipForGroup(2, 4, 6);
      const { payload } = await registerUser(baseClient, tracker, {}, ip);

      const login1 = await loginUser(
        baseClient,
        tracker,
        payload.email,
        payload.password,
        ip,
      );
      await Bun.sleep(1100);
      const login2 = await loginUser(
        baseClient,
        tracker,
        payload.email,
        payload.password,
        ip,
      );

      expect(login1.refreshToken).not.toBe(login2.refreshToken);

      const revoke1 = await baseClient.del(
        '/api/authentications',
        { refreshToken: login1.refreshToken },
        { ip },
      );
      expect(revoke1.status).toBe(200);

      const refresh1 = await baseClient.put(
        '/api/authentications',
        { refreshToken: login1.refreshToken },
        { ip },
      );
      expect(refresh1.status).toBe(400);
      expect(refresh1.body).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });

      const refresh2 = await baseClient.put(
        '/api/authentications',
        { refreshToken: login2.refreshToken },
        { ip },
      );
      expect(refresh2.status).toBe(200);
      expect(typeof refresh2.body?.data?.accessToken).toBe('string');

      const meRes = await baseClient.get('/api/users/me', {
        ip,
        token: refresh2.body.data.accessToken,
      });
      expect(meRes.status).toBe(200);
    });
  });

  describe('F5: Profile, Auth Middleware & RBAC Boundaries', () => {
    it('T2-F5-01: Missing Bearer prefix returns 401 Token tidak ditemukan atau format salah', async () => {
      const ip = ipForGroup(2, 5, 1);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const basicAuthRes = await baseClient.get('/api/users/me', {
        ip,
        headers: { Authorization: 'Basic abc' },
      });
      expect(basicAuthRes.status).toBe(401);
      expect(basicAuthRes.body).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });

      const rawTokenRes = await baseClient.get('/api/users/me', {
        ip,
        headers: { Authorization: session.accessToken },
      });
      expect(rawTokenRes.status).toBe(401);
      expect(rawTokenRes.body).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });

      // WHATWG fetch() trims trailing whitespace, so 'Bearer ' arrives on the wire as 'Bearer'.
      const trailingSpaceBearerRes = await baseClient.get('/api/users/me', {
        ip,
        headers: { Authorization: 'Bearer ' },
      });
      expect(trailingSpaceBearerRes.status).toBe(401);
      expect(trailingSpaceBearerRes.body).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });
    });

    it('T2-F5-02: Empty token after Bearer prefix and malformed JWT return 401', async () => {
      const ip = ipForGroup(2, 5, 1);

      // Double space keeps 'Bearer ' prefix intact while split(' ')[1] is ''.
      const emptyBearerRes = await baseClient.get('/api/users/me', {
        ip,
        headers: { Authorization: 'Bearer  abc' },
      });
      expect(emptyBearerRes.status).toBe(401);
      expect(emptyBearerRes.body).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });

      const malformedRes = await baseClient.get('/api/users/me', {
        ip,
        headers: { Authorization: 'Bearer not.a.jwt' },
      });
      expect(malformedRes.status).toBe(401);
      expect(malformedRes.body).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });
    });

    it('T2-F5-03: Tampered JWT signature and refreshToken used as Bearer accessToken return 401', async () => {
      const ip = ipForGroup(2, 5, 2);
      const session = await registerAndLogin(baseClient, tracker, {}, ip);

      const [hdr, pay, sig] = session.accessToken.split('.');
      const tampered = `${hdr}.${pay}.${sig![0] === 'A' ? 'B' : 'A'}${sig!.slice(1)}`;

      const tamperedRes = await baseClient.get('/api/users/me', {
        ip,
        token: tampered,
      });
      expect(tamperedRes.status).toBe(401);
      expect(tamperedRes.body).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });

      const refreshAsAccessRes = await baseClient.get('/api/users/me', {
        ip,
        token: session.refreshToken,
      });
      expect(refreshAsAccessRes.status).toBe(401);
      expect(refreshAsAccessRes.body).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });
    });

    it('T2-F5-04: Expired accessToken signed with ACCESS_TOKEN_KEY returns 401', async () => {
      const ip = ipForGroup(2, 5, 3);
      const { user } = await registerUser(baseClient, tracker, {}, ip);
      const expiredToken = mintExpiredAccessToken({
        id: user.id,
        role: user.role,
        prodi: user.prodi,
      });

      const res = await baseClient.get('/api/users/me', {
        ip,
        token: expiredToken,
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });
    });

    it('T2-F5-05: MODERATOR role calling GET /api/users is rejected with 403', async () => {
      const ip = ipForGroup(2, 5, 4);
      const moderator = await createModeratorSession(baseClient, tracker, {}, ip);

      const res = await baseClient.get('/api/users', {
        ip,
        token: moderator.accessToken,
      });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
      });
    });

    it('T2-F5-06: Field parity between GET /api/users/me (no createdAt) and GET /api/users (includes createdAt)', async () => {
      const ip = ipForGroup(2, 5, 4);
      const admin = await createAdminSession(baseClient, tracker, {}, ip);

      const meRes = await baseClient.get('/api/users/me', {
        ip,
        token: admin.accessToken,
      });
      expect(meRes.status).toBe(200);
      expect(meRes.body?.data).toEqual({
        id: admin.user.id,
        email: admin.payload.email,
        username: admin.payload.username,
        fullName: admin.payload.fullName,
        role: 'ADMIN',
        prodi: admin.payload.prodi,
      });
      expect('createdAt' in meRes.body.data).toBe(false);
      expect('password' in meRes.body.data).toBe(false);

      const listRes = await baseClient.get('/api/users', {
        ip,
        token: admin.accessToken,
      });
      expect(listRes.status).toBe(200);
      const items = listRes.body.data as Array<Record<string, unknown>>;
      const adminRow = items.find((u) => u.id === admin.user.id);
      expect(adminRow).toBeDefined();
      expect(typeof adminRow?.createdAt).toBe('string');
      expect('password' in (adminRow ?? {})).toBe(false);
    });
  });
});
