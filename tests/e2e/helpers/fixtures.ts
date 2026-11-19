import { createHmac } from 'node:crypto';
import type { HttpClient, HttpResponse } from './http.ts';
import {
  createCleanupTracker,
  promoteUserRole,
  type E2EUserRole,
  type MutableE2ECleanupTracker,
} from './db.ts';
import { e2eConfig } from './config.ts';

export type UserRole = E2EUserRole;
export type E2ETracker = MutableE2ECleanupTracker;
export { createCleanupTracker };
export const createTracker = createCleanupTracker;

export interface UserRegistrationPayload {
  email: string;
  username: string;
  password: string;
  fullName: string;
  prodi: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  prodi: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthSession {
  payload: UserRegistrationPayload;
  user: RegisteredUser;
  accessToken: string;
  refreshToken: string;
}

let seqCounter = 0;
const RUN_NONCE = crypto.randomUUID().replace(/-/g, '').slice(0, 6);

/**
 * Generates an all-lowercase [a-z0-9_] unique identifier safe for both
 * usernames (/^[a-zA-Z0-9_]+$/) and .ac.id email addresses.
 */
export function uniqueId(prefix = 'e2e'): string {
  seqCounter += 1;
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'e2e';
  const ts = Date.now().toString(36);
  const seq = seqCounter.toString(36);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 4);
  return `${safePrefix}_${RUN_NONCE}_${ts}_${seq}_${rand}`;
}

/**
 * Deterministic synthetic X-Forwarded-For IP per test group (and optional sub-index).
 * - sub === 0: `10.200.<tier>.<group>`
 * - sub > 0:   `10.<200 + tier>.<group>.<sub>`
 */
export function ipForGroup(tier: number, group: number, sub = 0): string {
  if (sub === 0) {
    return `10.200.${tier}.${group}`;
  }
  return `10.${200 + tier}.${group}.${sub}`;
}

export function buildUserPayload(
  overrides: Partial<UserRegistrationPayload> = {},
): UserRegistrationPayload {
  const id = uniqueId('u');
  return {
    email: `${id}@student.uin-suka.ac.id`,
    username: id,
    password: 'Password123!',
    fullName: `E2E User ${id.slice(-8)}`,
    prodi: 'Informatika',
    ...overrides,
  };
}

export async function registerUser(
  client: HttpClient,
  tracker: E2ETracker,
  overrides: Partial<UserRegistrationPayload> = {},
  requestIp?: string,
): Promise<{
  payload: UserRegistrationPayload;
  user: RegisteredUser;
  response: HttpResponse;
}> {
  const payload = buildUserPayload(overrides);
  const response = await client.post(
    '/api/users',
    payload,
    requestIp ? { ip: requestIp } : {},
  );
  if (response.status !== 201 || !response.body?.data?.id) {
    throw new Error(
      `registerUser failed: status=${response.status}, body=${response.rawText}`,
    );
  }
  const user = response.body.data as RegisteredUser;
  tracker.userIds.push(user.id);
  tracker.userEmails.push(payload.email);
  return { payload, user, response };
}

export async function loginUser(
  client: HttpClient,
  tracker: E2ETracker,
  identifier: string,
  password: string,
  requestIp?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  response: HttpResponse;
}> {
  const response = await client.post(
    '/api/authentications',
    { identifier, password },
    requestIp ? { ip: requestIp } : {},
  );
  if (response.status !== 201 || !response.body?.data?.accessToken) {
    throw new Error(
      `loginUser failed: status=${response.status}, body=${response.rawText}`,
    );
  }
  const { accessToken, refreshToken } = response.body.data as {
    accessToken: string;
    refreshToken: string;
  };
  tracker.tokens.push(refreshToken);
  return { accessToken, refreshToken, response };
}

export async function registerAndLogin(
  client: HttpClient,
  tracker: E2ETracker,
  overrides: Partial<UserRegistrationPayload> = {},
  requestIp?: string,
): Promise<AuthSession> {
  const { payload, user } = await registerUser(
    client,
    tracker,
    overrides,
    requestIp,
  );
  const { accessToken, refreshToken } = await loginUser(
    client,
    tracker,
    payload.email,
    payload.password,
    requestIp,
  );
  return { payload, user, accessToken, refreshToken };
}

async function createRoleSession(
  role: UserRole,
  client: HttpClient,
  tracker: E2ETracker,
  overrides: Partial<UserRegistrationPayload> = {},
  requestIp?: string,
): Promise<AuthSession> {
  const { payload, user } = await registerUser(
    client,
    tracker,
    overrides,
    requestIp,
  );
  await promoteUserRole(payload.email, role);
  const { accessToken, refreshToken } = await loginUser(
    client,
    tracker,
    payload.email,
    payload.password,
    requestIp,
  );
  return {
    payload,
    user: { ...user, role },
    accessToken,
    refreshToken,
  };
}

export function createAdminSession(
  client: HttpClient,
  tracker: E2ETracker,
  overrides: Partial<UserRegistrationPayload> = {},
  requestIp?: string,
): Promise<AuthSession> {
  return createRoleSession('ADMIN', client, tracker, overrides, requestIp);
}

export function createModeratorSession(
  client: HttpClient,
  tracker: E2ETracker,
  overrides: Partial<UserRegistrationPayload> = {},
  requestIp?: string,
): Promise<AuthSession> {
  return createRoleSession('MODERATOR', client, tracker, overrides, requestIp);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Signs an HS256 JWT without importing `src/` or `jsonwebtoken`.
 */
export function signHs256Jwt(
  claims: Record<string, unknown>,
  secret: string,
  options: { expiresInSeconds?: number; iatSeconds?: number } = {},
): string {
  const iat = options.iatSeconds ?? Math.floor(Date.now() / 1000);
  const payloadObj: Record<string, unknown> = { ...claims, iat };
  if (options.expiresInSeconds !== undefined) {
    payloadObj.exp = iat + options.expiresInSeconds;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * Mints an expired HS256 accessToken signed with ACCESS_TOKEN_KEY for T2-F5-04.
 */
export function mintExpiredAccessToken(
  user: { id: string; role?: UserRole; prodi?: string },
  secret: string = e2eConfig.accessTokenKey,
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return signHs256Jwt(
    {
      id: user.id,
      role: user.role ?? 'USER',
      prodi: user.prodi ?? 'Informatika',
    },
    secret,
    { iatSeconds: nowSec - 3600, expiresInSeconds: 60 },
  );
}

/**
 * Decodes JWT payload (without signature verification) for opaque-box claim assertions.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new Error(`Invalid JWT structure: ${token}`);
  }
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}
