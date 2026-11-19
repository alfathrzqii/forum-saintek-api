import { Elysia } from 'elysia';
import { getHealth, type HealthCheckDb } from '../controllers/healthController.ts';

export function createHealthRoutes(checkDb?: HealthCheckDb) {
  return new Elysia({ prefix: '/api/health' }).get(
    '/',
    ({ set }) => getHealth(set, checkDb),
    {
      detail: {
        tags: ['Monitoring'],
        summary: 'Periksa kesehatan sistem dan koneksi database',
      },
    },
  );
}

export const healthRoutes = createHealthRoutes();

export default healthRoutes;
