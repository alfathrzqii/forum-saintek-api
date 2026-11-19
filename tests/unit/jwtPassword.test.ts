import { describe, expect, it } from 'bun:test';
import jwt from 'jsonwebtoken';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/forum_saintek_test';

const { config } = await import('../../src/config/index.ts');
const { hashPassword, verifyPassword } = await import(
  '../../src/utils/password.ts'
);
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = await import('../../src/utils/jwt.ts');

describe('M3 Password & JWT Utilities', () => {
  describe('password.ts (Bun.password bcrypt cost 10)', () => {
    it('hashes password with $2b$10$ bcrypt prefix and verifies correctly', async () => {
      const plain = 'Password123!';
      const hashed = await hashPassword(plain);

      expect(hashed).toStartWith('$2b$10$');
      expect(hashed.length).toBe(60);
      expect(await verifyPassword(plain, hashed)).toBe(true);
      expect(await verifyPassword('WrongPassword!', hashed)).toBe(false);
    });
  });

  describe('jwt.ts (HS256)', () => {
    const samplePayload = {
      id: '11111111-1111-4111-8111-111111111111',
      role: 'USER' as const,
      prodi: 'Informatika',
    };

    it('signs and verifies access token with HS256 and 15m TTL', () => {
      const token = signAccessToken(samplePayload);
      const decoded = verifyAccessToken(token);

      expect(decoded).toEqual(samplePayload);

      const raw = jwt.decode(token, { complete: true });
      expect(raw?.header.alg).toBe('HS256');
      const claims = raw?.payload as jwt.JwtPayload;
      expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(15 * 60);
    });

    it('signs and verifies refresh token with HS256 and 7d TTL', () => {
      const token = signRefreshToken(samplePayload);
      const decoded = verifyRefreshToken(token);

      expect(decoded).toEqual(samplePayload);

      const raw = jwt.decode(token, { complete: true });
      expect(raw?.header.alg).toBe('HS256');
      const claims = raw?.payload as jwt.JwtPayload;
      expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(7 * 24 * 60 * 60);
    });

    it('rejects cross-key tokens (refresh token passed to verifyAccessToken and vice versa)', () => {
      const access = signAccessToken(samplePayload);
      const refresh = signRefreshToken(samplePayload);

      expect(() => verifyAccessToken(refresh)).toThrow();
      expect(() => verifyRefreshToken(access)).toThrow();
    });

    it('rejects expired or tampered tokens', () => {
      const expired = jwt.sign(samplePayload, config.jwt.accessTokenKey, {
        algorithm: 'HS256',
        expiresIn: -10,
      });
      expect(() => verifyAccessToken(expired)).toThrow();

      const tampered = jwt.sign(samplePayload, 'wrong-secret', {
        algorithm: 'HS256',
      });
      expect(() => verifyAccessToken(tampered)).toThrow();
      expect(() => verifyRefreshToken(tampered)).toThrow();
    });

    it('rejects tokens whose payload is a string or missing string id', () => {
      const stringPayloadToken = jwt.sign(
        'just-a-string',
        config.jwt.accessTokenKey,
        { algorithm: 'HS256' },
      );
      expect(() => verifyAccessToken(stringPayloadToken)).toThrow();

      const missingIdToken = jwt.sign(
        { role: 'USER', prodi: 'Informatika' },
        config.jwt.accessTokenKey,
        { algorithm: 'HS256' },
      );
      expect(() => verifyAccessToken(missingIdToken)).toThrow();

      const nonStringIdToken = jwt.sign(
        { id: 123, role: 'USER', prodi: 'Informatika' },
        config.jwt.refreshTokenKey,
        { algorithm: 'HS256' },
      );
      expect(() => verifyRefreshToken(nonStringIdToken)).toThrow();
    });
  });
});
