import jwt from 'jsonwebtoken';
import { config } from '../config/index.ts';
import type { Role } from '../db/schema.ts';

export interface JwtPayload {
  id: string;
  role: Role;
  prodi: string;
}

function validateDecodedPayload(decoded: string | jwt.JwtPayload): JwtPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }

  const record = decoded as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error('Invalid token payload: missing string id');
  }

  return {
    id: record.id,
    role: record.role as Role,
    prodi: record.prodi as string,
  };
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(
    { id: payload.id, role: payload.role, prodi: payload.prodi },
    config.jwt.accessTokenKey,
    {
      algorithm: 'HS256',
      expiresIn: config.jwt.accessTokenAge,
    },
  );
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(
    { id: payload.id, role: payload.role, prodi: payload.prodi },
    config.jwt.refreshTokenKey,
    {
      algorithm: 'HS256',
      expiresIn: '7d',
    },
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.accessTokenKey, {
    algorithms: ['HS256'],
  });
  return validateDecodedPayload(decoded);
}

export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.refreshTokenKey, {
    algorithms: ['HS256'],
  });
  return validateDecodedPayload(decoded);
}
