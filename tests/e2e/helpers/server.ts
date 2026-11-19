import { createServer } from 'node:net';
import {
  buildChildServerEnv,
  getE2EConfig,
  type E2EConfig,
} from './config.ts';

export interface E2EServerHandle {
  baseUrl: string;
  managed: boolean;
  stop: () => Promise<void>;
}

export interface SpawnServerOptions {
  databaseUrl?: string;
  readyPath?: '/api' | '/api/health';
  timeoutMs?: number;
  envOverrides?: Record<string, string>;
}

const MAX_LOG_LINES = 60;

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        server.close(() => {
          reject(new Error('Failed to determine an ephemeral localhost port.'));
        });
        return;
      }
      const { port } = addr;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

function drainStreamToRingBuffer(
  stream: ReadableStream<Uint8Array> | number | undefined | null,
  buffer: string[],
  label: 'stdout' | 'stderr',
): Promise<void> {
  if (!stream || typeof stream === 'number') {
    return Promise.resolve();
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let remainder = '';

  return (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        remainder += decoder.decode(value, { stream: true });
        const lines = remainder.split(/\r?\n/);
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          if (line.length > 0) {
            buffer.push(`[${label}] ${line}`);
            if (buffer.length > MAX_LOG_LINES) {
              buffer.shift();
            }
          }
        }
      }
      const tail = remainder + decoder.decode();
      if (tail.length > 0) {
        buffer.push(`[${label}] ${tail}`);
        if (buffer.length > MAX_LOG_LINES) {
          buffer.shift();
        }
      }
    } catch {
      // Ignore stream close errors during teardown
    } finally {
      reader.releaseLock();
    }
  })();
}

async function waitForExternalHttpReady(
  url: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.status === 200) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(intervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for external E2E server at ${url} (last error: ${lastError})`,
  );
}

async function waitForChildHttpReady(
  url: string,
  proc: Bun.Subprocess,
  timeoutMs: number,
  intervalMs: number,
  getLogs: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response yet';
  let exitedCode: number | null = null;

  void proc.exited.then((code) => {
    exitedCode = code;
  });

  while (Date.now() < deadline) {
    if (exitedCode !== null) {
      throw new Error(
        `Spawned E2E server exited prematurely with code ${exitedCode} while polling ${url}.\nCaptured logs:\n${getLogs()}`,
      );
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status === 200) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const sleepOrExit = await Promise.race([
      Bun.sleep(intervalMs).then(() => 'tick' as const),
      proc.exited.then((code) => ({ exited: code })),
    ]);

    if (typeof sleepOrExit === 'object') {
      throw new Error(
        `Spawned E2E server exited prematurely with code ${sleepOrExit.exited} while polling ${url}.\nCaptured logs:\n${getLogs()}`,
      );
    }
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for spawned E2E server at ${url} (last error: ${lastError}).\nCaptured logs:\n${getLogs()}`,
  );
}

export async function spawnIsolatedE2EServer(
  options: SpawnServerOptions = {},
  config: E2EConfig = getE2EConfig(),
): Promise<E2EServerHandle> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const readyPath = options.readyPath ?? (config.noDb ? '/api' : '/api/health');
  const timeoutMs = options.timeoutMs ?? config.serverTimeoutMs;

  const env = buildChildServerEnv(port, config, {
    ...(options.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
    ...options.envOverrides,
  });

  const proc = Bun.spawn([...config.startupCommand], {
    cwd: config.backendRoot,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const logs: string[] = [];
  const stdoutDrain = drainStreamToRingBuffer(proc.stdout, logs, 'stdout');
  const stderrDrain = drainStreamToRingBuffer(proc.stderr, logs, 'stderr');

  let stopPromise: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = (async () => {
      try {
        if (proc.exitCode === null) {
          proc.kill('SIGTERM');
          const result = await Promise.race([
            proc.exited.then(() => 'exited' as const),
            Bun.sleep(3000).then(() => 'timeout' as const),
          ]);
          if (result === 'timeout' && proc.exitCode === null) {
            proc.kill('SIGKILL');
            await proc.exited;
          }
        } else {
          await proc.exited;
        }
      } catch {
        // Process may already have terminated
      }

      await Promise.allSettled([stdoutDrain, stderrDrain]);
    })();

    return stopPromise;
  };

  try {
    await waitForChildHttpReady(
      `${baseUrl}${readyPath}`,
      proc,
      timeoutMs,
      config.pollIntervalMs,
      () => (logs.length > 0 ? logs.join('\n') : '(no output captured)'),
    );
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    baseUrl,
    managed: true,
    stop,
  };
}

export async function ensureE2EServer(
  config: E2EConfig = getE2EConfig(),
): Promise<E2EServerHandle> {
  if (config.baseUrl) {
    const readyPath = config.noDb ? '/api' : '/api/health';
    await waitForExternalHttpReady(
      `${config.baseUrl}${readyPath}`,
      config.serverTimeoutMs,
      config.pollIntervalMs,
    );
    return {
      baseUrl: config.baseUrl,
      managed: false,
      stop: async () => {},
    };
  }

  return spawnIsolatedE2EServer({}, config);
}

export async function startUnhealthyE2EServer(
  config: E2EConfig = getE2EConfig(),
): Promise<E2EServerHandle> {
  const deadDbPort = await getFreePort();
  const unreachableDbUrl = `postgresql://e2e_invalid:e2e_invalid@127.0.0.1:${deadDbPort}/e2e_nonexistent`;
  return spawnIsolatedE2EServer(
    {
      databaseUrl: unreachableDbUrl,
      readyPath: '/api',
    },
    config,
  );
}
