import type { Context } from 'elysia';
import { sql } from '../../db/index.ts';
import { successResponse } from '../../utils/response.ts';

export type HealthCheckDb = () => Promise<unknown>;

export async function getHealth(
  set: Pick<Context['set'], 'status'>,
  checkDb: HealthCheckDb = () => sql`SELECT 1`,
) {
  try {
    await checkDb();

    return successResponse(set, 'Sistem berjalan normal', {
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    set.status = 503;
    return {
      status: 'error' as const,
      message: 'Sistem tidak sehat: Koneksi database terputus',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
