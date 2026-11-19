import { beforeEach, describe, expect, it, mock } from 'bun:test';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/forum_saintek_test';

const { createApp } = await import('../../src/app.ts');
const { AuthenticationError } = await import(
  '../../src/exceptions/AuthenticationError.ts'
);
const { InvariantError } = await import(
  '../../src/exceptions/InvariantError.ts'
);
const { resetRateLimiters } = await import(
  '../../src/api/middlewares/rateLimitMiddleware.ts'
);
const { signAccessToken, signRefreshToken } = await import(
  '../../src/utils/jwt.ts'
);

const regularUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'mhs@student.uin-suka.ac.id',
  username: 'mhs_keren',
  fullName: 'Mahasiswa Saintek',
  role: 'USER' as const,
  prodi: 'Informatika',
};

const moderatorUser = {
  ...regularUser,
  id: '22222222-2222-4222-8222-222222222222',
  role: 'MODERATOR' as const,
};

const adminUser = {
  ...regularUser,
  id: '33333333-3333-4333-8333-333333333333',
  username: 'admin_saintek',
  role: 'ADMIN' as const,
};

function createTestHarness() {
  const authenticationService = {
    login: mock(async () => ({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    })),
    refresh: mock(async () => 'new-access-token'),
    logout: mock(async () => undefined),
  };

  const userService = {
    register: mock(async (data) => ({
      id: regularUser.id,
      email: data.email,
      username: data.username,
      fullName: data.fullName ?? 'Fallback',
      prodi: data.prodi,
      role: 'USER' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    getAllUsers: mock(async () => [
      {
        ...regularUser,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]),
  };

  const findUserById = mock(async (id: string) => {
    if (id === regularUser.id) return regularUser;
    if (id === moderatorUser.id) return moderatorUser;
    if (id === adminUser.id) return adminUser;
    return null;
  });

  const app = createApp({
    checkDb: async () => [{ ok: 1 }],
    authenticationService,
    userService,
    authMiddlewareDeps: { findUserById },
  });

  return { app, authenticationService, userService, findUserById };
}

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('M3 Auth & User Routes Integration (DI Unit Tests)', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  describe('POST /api/authentications', () => {
    it('returns 201 and strips unknown fields on login', async () => {
      const { app, authenticationService } = createTestHarness();

      const res = await app.handle(
        jsonRequest('/api/authentications', 'POST', {
          identifier: 'mhs_keren',
          password: 'Password123!',
          extraField: 'should-be-stripped',
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        status: 'success',
        message: 'Authentication berhasil ditambahkan',
        data: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      });
      expect(authenticationService.login).toHaveBeenCalledWith({
        identifier: 'mhs_keren',
        password: 'Password123!',
      });
    });

    it('returns 400 with exact Indonesian messages for login validation errors (including legacy { email })', async () => {
      const { app } = createTestHarness();

      const resLegacyEmail = await app.handle(
        jsonRequest('/api/authentications', 'POST', {
          email: 'mhs@student.uin-suka.ac.id',
          password: 'Password123!',
        }),
      );
      expect(resLegacyEmail.status).toBe(400);
      expect(await resLegacyEmail.json()).toEqual({
        status: 'error',
        message: 'Email atau username minimal 3 karakter',
      });

      const resShortId = await app.handle(
        jsonRequest('/api/authentications', 'POST', {
          identifier: 'ab',
          password: 'Password123!',
        }),
      );
      expect(resShortId.status).toBe(400);
      expect(await resShortId.json()).toEqual({
        status: 'error',
        message: 'Email atau username minimal 3 karakter',
      });

      const resEmptyPassword = await app.handle(
        jsonRequest('/api/authentications', 'POST', {
          identifier: 'mhs_keren',
          password: '',
        }),
      );
      expect(resEmptyPassword.status).toBe(400);
      expect(await resEmptyPassword.json()).toEqual({
        status: 'error',
        message: 'Password harus diisi',
      });
    });

    it('returns 401 when credentials are invalid', async () => {
      const { app, authenticationService } = createTestHarness();
      authenticationService.login.mockRejectedValue(
        new AuthenticationError('Kredensial tidak valid'),
      );

      const res = await app.handle(
        jsonRequest('/api/authentications', 'POST', {
          identifier: 'mhs_keren',
          password: 'wrong',
        }),
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        status: 'error',
        message: 'Kredensial tidak valid',
      });
    });
  });

  describe('PUT /api/authentications & DELETE /api/authentications', () => {
    it('PUT returns 200 with new accessToken and maps validation/service errors', async () => {
      const { app, authenticationService } = createTestHarness();

      const okRes = await app.handle(
        jsonRequest('/api/authentications', 'PUT', {
          refreshToken: 'valid-refresh',
        }),
      );
      expect(okRes.status).toBe(200);
      expect(await okRes.json()).toEqual({
        status: 'success',
        message: 'Access Token berhasil diperbarui',
        data: { accessToken: 'new-access-token' },
      });

      const emptyRes = await app.handle(
        jsonRequest('/api/authentications', 'PUT', { refreshToken: '' }),
      );
      expect(emptyRes.status).toBe(400);
      expect(await emptyRes.json()).toEqual({
        status: 'error',
        message: 'Refresh token harus ada',
      });

      authenticationService.refresh.mockRejectedValueOnce(
        new InvariantError('Refresh token tidak valid'),
      );
      const notInDbRes = await app.handle(
        jsonRequest('/api/authentications', 'PUT', { refreshToken: 'missing' }),
      );
      expect(notInDbRes.status).toBe(400);
      expect(await notInDbRes.json()).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });

      authenticationService.refresh.mockRejectedValueOnce(
        new AuthenticationError('Refresh token kadaluarsa'),
      );
      const expiredRes = await app.handle(
        jsonRequest('/api/authentications', 'PUT', { refreshToken: 'expired' }),
      );
      expect(expiredRes.status).toBe(401);
      expect(await expiredRes.json()).toEqual({
        status: 'error',
        message: 'Refresh token kadaluarsa',
      });
    });

    it('DELETE returns 200 and omits data property completely', async () => {
      const { app, authenticationService } = createTestHarness();

      const res = await app.handle(
        jsonRequest('/api/authentications', 'DELETE', {
          refreshToken: 'valid-refresh',
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        status: 'success',
        message: 'Refresh token berhasil dihapus (Logout berhasil)',
      });
      expect('data' in body).toBe(false);

      const emptyRes = await app.handle(
        jsonRequest('/api/authentications', 'DELETE', { refreshToken: '' }),
      );
      expect(emptyRes.status).toBe(400);
      expect(await emptyRes.json()).toEqual({
        status: 'error',
        message: 'Refresh token harus ada',
      });

      authenticationService.logout.mockRejectedValueOnce(
        new InvariantError('Refresh token tidak valid'),
      );
      const invalidRes = await app.handle(
        jsonRequest('/api/authentications', 'DELETE', {
          refreshToken: 'unknown',
        }),
      );
      expect(invalidRes.status).toBe(400);
      expect(await invalidRes.json()).toEqual({
        status: 'error',
        message: 'Refresh token tidak valid',
      });
    });
  });

  describe('POST /api/users', () => {
    it('registers valid user, returns 201 without password, and strips role=ADMIN', async () => {
      const { app, userService } = createTestHarness();

      const res = await app.handle(
        jsonRequest('/api/users', 'POST', {
          email: 'mhs123@student.uin-suka.ac.id',
          username: 'mhs_keren',
          password: 'Password123!',
          fullName: 'Mahasiswa Saintek',
          prodi: 'Informatika',
          role: 'ADMIN',
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        status: string;
        message: string;
        data: Record<string, unknown>;
      };
      expect(body.status).toBe('success');
      expect(body.message).toBe('User berhasil didaftarkan');
      expect(body.data.role).toBe('USER');
      expect('password' in body.data).toBe(false);
      expect(userService.register).toHaveBeenCalledWith({
        email: 'mhs123@student.uin-suka.ac.id',
        username: 'mhs_keren',
        password: 'Password123!',
        fullName: 'Mahasiswa Saintek',
        prodi: 'Informatika',
      });
    });

    it('enforces all distinct validation messages including multi-constraint email and username', async () => {
      const { app } = createTestHarness();
      const basePayload = {
        email: 'mhs123@student.uin-suka.ac.id',
        username: 'mhs_keren',
        password: 'Password123!',
        fullName: 'Mahasiswa Saintek',
        prodi: 'Informatika',
      };

      const cases: Array<[Record<string, unknown>, string]> = [
        [{ ...basePayload, email: 'not-an-email' }, 'Format email tidak valid'],
        [
          { ...basePayload, email: 'user@gmail.com' },
          'Email harus menggunakan domain universitas (.ac.id)',
        ],
        [
          { ...basePayload, email: 'user@STUDENT.UIN-SUKA.AC.ID' },
          'Email harus menggunakan domain universitas (.ac.id)',
        ],
        [{ ...basePayload, username: 'ab' }, 'Username minimal 3 karakter'],
        [
          { ...basePayload, username: 'ab!' },
          'Username hanya boleh berisi huruf, angka, dan underscore',
        ],
        [
          { ...basePayload, username: 'a!' },
          'Username minimal 3 karakter',
        ],
        [
          { ...basePayload, password: 'short' },
          'Password minimal 8 karakter',
        ],
        [
          { ...basePayload, fullName: 'ab' },
          'Nama lengkap minimal 3 karakter',
        ],
        [{ ...basePayload, prodi: 'A' }, 'Prodi harus diisi'],
      ];

      for (const [payload, expectedMessage] of cases) {
        const res = await app.handle(jsonRequest('/api/users', 'POST', payload));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          status: 'error',
          message: expectedMessage,
        });
      }
    });

    it('allows omitted fullName in validator (matching main optional schema)', async () => {
      const { app } = createTestHarness();
      const res = await app.handle(
        jsonRequest('/api/users', 'POST', {
          email: 'mhs123@student.uin-suka.ac.id',
          username: 'mhs_keren',
          password: 'Password123!',
          prodi: 'Informatika',
        }),
      );
      expect(res.status).toBe(201);
    });

    it('returns 400 for duplicate email or username from service', async () => {
      const { app, userService } = createTestHarness();
      userService.register.mockRejectedValueOnce(
        new InvariantError('Email sudah digunakan'),
      );

      const dupEmail = await app.handle(
        jsonRequest('/api/users', 'POST', {
          email: 'mhs123@student.uin-suka.ac.id',
          username: 'mhs_keren',
          password: 'Password123!',
          fullName: 'Mahasiswa Saintek',
          prodi: 'Informatika',
        }),
      );
      expect(dupEmail.status).toBe(400);
      expect(await dupEmail.json()).toEqual({
        status: 'error',
        message: 'Email sudah digunakan',
      });
    });
  });

  describe('GET /api/users/me & GET /api/users', () => {
    it('GET /api/users/me returns 200 without password or createdAt', async () => {
      const { app } = createTestHarness();
      const token = signAccessToken({
        id: regularUser.id,
        role: regularUser.role,
        prodi: regularUser.prodi,
      });

      const res = await app.handle(
        new Request('http://localhost/api/users/me', {
          headers: { authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        message: string;
        data: Record<string, unknown>;
      };
      expect(body).toEqual({
        status: 'success',
        message: 'Profil berhasil dimuat',
        data: regularUser,
      });
      expect('password' in body.data).toBe(false);
      expect('createdAt' in body.data).toBe(false);
    });

    it('GET /api/users/me returns 401 for missing header, refresh token, or ghost user', async () => {
      const { app } = createTestHarness();

      const missingRes = await app.handle(
        new Request('http://localhost/api/users/me'),
      );
      expect(missingRes.status).toBe(401);
      expect(await missingRes.json()).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });

      const refreshAsAccess = signRefreshToken({
        id: regularUser.id,
        role: regularUser.role,
        prodi: regularUser.prodi,
      });
      const badTokenRes = await app.handle(
        new Request('http://localhost/api/users/me', {
          headers: { authorization: `Bearer ${refreshAsAccess}` },
        }),
      );
      expect(badTokenRes.status).toBe(401);
      expect(await badTokenRes.json()).toEqual({
        status: 'error',
        message: 'Token tidak valid atau sudah kadaluarsa',
      });

      const ghostToken = signAccessToken({
        id: '99999999-9999-4999-8999-999999999999',
        role: 'USER',
        prodi: 'Informatika',
      });
      const ghostRes = await app.handle(
        new Request('http://localhost/api/users/me', {
          headers: { authorization: `Bearer ${ghostToken}` },
        }),
      );
      expect(ghostRes.status).toBe(401);
      expect(await ghostRes.json()).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });
    });

    it('GET /api/users returns 403 for USER/MODERATOR, 200 for ADMIN, and 500 on unexpected errors', async () => {
      const { app, userService } = createTestHarness();

      const userToken = signAccessToken({
        id: regularUser.id,
        role: 'USER',
        prodi: regularUser.prodi,
      });
      const userRes = await app.handle(
        new Request('http://localhost/api/users', {
          headers: { authorization: `Bearer ${userToken}` },
        }),
      );
      expect(userRes.status).toBe(403);
      expect(await userRes.json()).toEqual({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
      });

      const modToken = signAccessToken({
        id: moderatorUser.id,
        role: 'MODERATOR',
        prodi: moderatorUser.prodi,
      });
      const modRes = await app.handle(
        new Request('http://localhost/api/users', {
          headers: { authorization: `Bearer ${modToken}` },
        }),
      );
      expect(modRes.status).toBe(403);

      const adminToken = signAccessToken({
        id: adminUser.id,
        role: 'ADMIN',
        prodi: adminUser.prodi,
      });
      const adminRes = await app.handle(
        new Request('http://localhost/api/users', {
          headers: { authorization: `Bearer ${adminToken}` },
        }),
      );
      expect(adminRes.status).toBe(200);
      const adminBody = (await adminRes.json()) as {
        status: string;
        message: string;
        data: unknown[];
      };
      expect(adminBody.status).toBe('success');
      expect(adminBody.message).toBe('Daftar user berhasil dimuat');
      expect(adminBody.data.length).toBe(1);

      userService.getAllUsers.mockRejectedValueOnce(new Error('DB crash'));
      const errRes = await app.handle(
        new Request('http://localhost/api/users', {
          headers: { authorization: `Bearer ${adminToken}` },
        }),
      );
      expect(errRes.status).toBe(500);
      expect(await errRes.json()).toEqual({
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      });
    });
  });

  describe('authLimiter scoping & 400 counting', () => {
    it('counts 400 validation errors on POST /api/authentications (and trailing slash) without leaking to PUT/DELETE/GET', async () => {
      const { app } = createTestHarness();
      const ipHeaders = { 'x-forwarded-for': '203.0.113.10' };

      for (let i = 0; i < 10; i++) {
        const path =
          i === 9 ? '/api/authentications/' : '/api/authentications';
        const res = await app.handle(
          jsonRequest(path, 'POST', { identifier: 'ab', password: '' }, ipHeaders),
        );
        expect(res.status).toBe(400);
        expect(res.headers.get('ratelimit-policy')).toBe('10;w=3600');
      }

      const blockedRes = await app.handle(
        jsonRequest(
          '/api/authentications',
          'POST',
          { identifier: 'mhs_keren', password: 'Password123!' },
          ipHeaders,
        ),
      );
      expect(blockedRes.status).toBe(429);
      expect(await blockedRes.json()).toEqual({
        status: 'fail',
        message:
          'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });

      const putRes = await app.handle(
        jsonRequest(
          '/api/authentications',
          'PUT',
          { refreshToken: 'valid-refresh' },
          ipHeaders,
        ),
      );
      expect(putRes.status).toBe(200);
      expect(putRes.headers.get('ratelimit-policy')).toBe('100;w=900');

      const delRes = await app.handle(
        jsonRequest(
          '/api/authentications',
          'DELETE',
          { refreshToken: 'valid-refresh' },
          ipHeaders,
        ),
      );
      expect(delRes.status).toBe(200);
      expect(delRes.headers.get('ratelimit-policy')).toBe('100;w=900');

      const healthRes = await app.handle(
        new Request('http://localhost/api/health', { headers: ipHeaders }),
      );
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers.get('ratelimit-policy')).toBe('100;w=900');
    });

    it('counts 400 validation errors on POST /api/users without leaking to GET /api/users/me or GET /api/users', async () => {
      const { app } = createTestHarness();
      const ipHeaders = { 'x-forwarded-for': '203.0.113.11' };

      for (let i = 0; i < 10; i++) {
        const path = i === 9 ? '/api/users/' : '/api/users';
        const res = await app.handle(
          jsonRequest(path, 'POST', { email: 'bad' }, ipHeaders),
        );
        expect(res.status).toBe(400);
        expect(res.headers.get('ratelimit-policy')).toBe('10;w=3600');
      }

      const blockedRes = await app.handle(
        jsonRequest('/api/users', 'POST', { email: 'bad' }, ipHeaders),
      );
      expect(blockedRes.status).toBe(429);
      expect(await blockedRes.json()).toEqual({
        status: 'fail',
        message:
          'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });

      const adminToken = signAccessToken({
        id: adminUser.id,
        role: 'ADMIN',
        prodi: adminUser.prodi,
      });

      const meRes = await app.handle(
        new Request('http://localhost/api/users/me', {
          headers: { ...ipHeaders, authorization: `Bearer ${adminToken}` },
        }),
      );
      expect(meRes.status).toBe(200);
      expect(meRes.headers.get('ratelimit-policy')).toBe('100;w=900');

      const usersRes = await app.handle(
        new Request('http://localhost/api/users', {
          headers: { ...ipHeaders, authorization: `Bearer ${adminToken}` },
        }),
      );
      expect(usersRes.status).toBe(200);
      expect(usersRes.headers.get('ratelimit-policy')).toBe('100;w=900');
    });
  });

  describe('Swagger / OpenAPI spec', () => {
    it('exposes M3 Authentications and Users routes in /api-docs/json', async () => {
      const { app } = createTestHarness();
      const res = await app.handle(
        new Request('http://localhost/api-docs/json'),
      );

      expect(res.status).toBe(200);
      const spec = (await res.json()) as {
        paths: Record<string, Record<string, { tags?: string[]; security?: unknown[] }>>;
      };

      expect(spec.paths['/api/authentications/']).toBeDefined();
      expect(spec.paths['/api/authentications/']?.post?.tags).toContain(
        'Authentications',
      );
      expect(spec.paths['/api/authentications/']?.put?.tags).toContain(
        'Authentications',
      );
      expect(spec.paths['/api/authentications/']?.delete?.tags).toContain(
        'Authentications',
      );

      expect(spec.paths['/api/users/']).toBeDefined();
      expect(spec.paths['/api/users/']?.post?.tags).toContain('Users');
      expect(spec.paths['/api/users/']?.get?.tags).toContain('Users');
      expect(spec.paths['/api/users/']?.get?.security).toEqual([
        { bearerAuth: [] },
      ]);

      expect(spec.paths['/api/users/me']).toBeDefined();
      expect(spec.paths['/api/users/me']?.get?.tags).toContain('Users');
      expect(spec.paths['/api/users/me']?.get?.security).toEqual([
        { bearerAuth: [] },
      ]);
    });
  });
});
