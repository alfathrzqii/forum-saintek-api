import type { HTTPHeaders } from 'elysia';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitContext {
  request: Request;
  server: { requestIP: (request: Request) => { address: string } | null } | null;
  set: {
    headers: HTTPHeaders;
    status?: number | string;
  };
}

const stores: Array<Map<string, RateLimitEntry>> = [];

export function extractClientIp(
  request: Request,
  server?: { requestIP: (request: Request) => { address: string } | null } | null,
): string {
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const socketIp = server?.requestIP?.(request)?.address;
  if (socketIp) return socketIp;

  return '127.0.0.1';
}

function createLimiter(options: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();
  stores.push(store);

  const windowSeconds = Math.floor(options.windowMs / 1000);

  return function rateLimitHandler({ request, server, set }: RateLimitContext) {
    const now = Date.now();
    const key = extractClientIp(request, server);

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + options.windowMs,
      };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, options.limit - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    set.headers['ratelimit-policy'] = `${options.limit};w=${windowSeconds}`;
    set.headers['ratelimit'] =
      `limit=${options.limit}, remaining=${remaining}, reset=${resetSeconds}`;

    if (entry.count > options.limit) {
      set.status = 429;
      return {
        status: 'fail' as const,
        message: options.message,
      };
    }

    return undefined;
  };
}

export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message:
    'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit',
});

export const authLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message:
    'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
});

export function resetRateLimiters(): void {
  for (const store of stores) {
    store.clear();
  }
}
