import path from 'node:path';

export interface E2EConfig {
  readonly baseUrl: string | undefined;
  readonly databaseUrl: string;
  readonly accessTokenKey: string;
  readonly refreshTokenKey: string;
  readonly allowedOrigins: string;
  readonly noDb: boolean;
  readonly serverTimeoutMs: number;
  readonly pollIntervalMs: number;
  readonly startupCommand: readonly string[];
  readonly runId: string;
  readonly backendRoot: string;
}

const DEFAULT_DATABASE_URL =
  'postgresql://user:password@localhost:5432/forum_saintek';
const DEFAULT_ACCESS_TOKEN_KEY =
  'e2e_test_access_token_secret_key_change_in_prod';
const DEFAULT_REFRESH_TOKEN_KEY =
  'e2e_test_refresh_token_secret_key_change_in_prod';
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
const DEFAULT_SERVER_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 150;
const DEFAULT_STARTUP_COMMAND = ['bun', 'run', 'src/app.ts'] as const;

const GENERATED_RUN_ID = `e2e_${Date.now().toString(36)}_${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const BACKEND_ROOT = path.resolve(import.meta.dir, '../../..');

// Ensure localhost / loopback HTTP requests bypass sandbox HTTP_PROXY / HTTPS_PROXY.
function ensureLocalhostNoProxy(): void {
  const required = ['127.0.0.1', 'localhost', '::1'];
  const existing = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const merged = Array.from(new Set([...existing, ...required])).join(',');
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

ensureLocalhostNoProxy();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStartupCommand(raw: string | undefined): readonly string[] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [...DEFAULT_STARTUP_COMMAND];
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((part): part is string => typeof part === 'string' && part.length > 0)
      ) {
        return parsed;
      }
    } catch {
      // Fall back to whitespace splitting below
    }
  }
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [...DEFAULT_STARTUP_COMMAND];
}

function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function getE2EConfig(): E2EConfig {
  const baseUrlRaw = process.env.E2E_BASE_URL?.trim().replace(/\/+$/, '');
  return {
    baseUrl: baseUrlRaw && baseUrlRaw.length > 0 ? baseUrlRaw : undefined,
    databaseUrl:
      process.env.E2E_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      DEFAULT_DATABASE_URL,
    accessTokenKey:
      process.env.ACCESS_TOKEN_KEY?.trim() || DEFAULT_ACCESS_TOKEN_KEY,
    refreshTokenKey:
      process.env.REFRESH_TOKEN_KEY?.trim() || DEFAULT_REFRESH_TOKEN_KEY,
    allowedOrigins:
      process.env.ALLOWED_ORIGINS?.trim() || DEFAULT_ALLOWED_ORIGINS,
    noDb: parseBooleanFlag(process.env.E2E_NO_DB),
    serverTimeoutMs: parsePositiveInt(
      process.env.E2E_SERVER_TIMEOUT_MS,
      DEFAULT_SERVER_TIMEOUT_MS,
    ),
    pollIntervalMs: parsePositiveInt(
      process.env.E2E_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
    ),
    startupCommand: parseStartupCommand(process.env.E2E_STARTUP_COMMAND),
    runId: process.env.E2E_RUN_ID?.trim() || GENERATED_RUN_ID,
    backendRoot: BACKEND_ROOT,
  };
}

export const e2eConfig: E2EConfig = {
  get baseUrl() {
    return getE2EConfig().baseUrl;
  },
  get databaseUrl() {
    return getE2EConfig().databaseUrl;
  },
  get accessTokenKey() {
    return getE2EConfig().accessTokenKey;
  },
  get refreshTokenKey() {
    return getE2EConfig().refreshTokenKey;
  },
  get allowedOrigins() {
    return getE2EConfig().allowedOrigins;
  },
  get noDb() {
    return getE2EConfig().noDb;
  },
  get serverTimeoutMs() {
    return getE2EConfig().serverTimeoutMs;
  },
  get pollIntervalMs() {
    return getE2EConfig().pollIntervalMs;
  },
  get startupCommand() {
    return getE2EConfig().startupCommand;
  },
  get runId() {
    return getE2EConfig().runId;
  },
  get backendRoot() {
    return BACKEND_ROOT;
  },
};

export function buildChildServerEnv(
  port: number,
  config: E2EConfig = getE2EConfig(),
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  env.NODE_ENV = 'e2e';
  env.PORT = String(port);
  env.BASE_URL = `http://127.0.0.1:${port}`;
  env.DATABASE_URL = config.databaseUrl;
  env.ACCESS_TOKEN_KEY = config.accessTokenKey;
  env.REFRESH_TOKEN_KEY = config.refreshTokenKey;
  env.ALLOWED_ORIGINS = config.allowedOrigins;

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }

  return env;
}
