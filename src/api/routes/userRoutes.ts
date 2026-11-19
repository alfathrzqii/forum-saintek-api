import { Elysia } from 'elysia';
import type { UserService } from '../../services/userService.ts';
import { successResponse } from '../../utils/response.ts';
import { createUserSchema } from '../../validators/userValidator.ts';
import { createUserController } from '../controllers/userController.ts';
import {
  createAuthMiddleware,
  type AuthMiddlewareDeps,
} from '../middlewares/authenticationMiddleware.ts';
import { authLimiter } from '../middlewares/rateLimitMiddleware.ts';
import { requireRole } from '../middlewares/roleMiddleware.ts';

export interface UserRoutesDeps {
  userService?: UserService;
  authMiddlewareDeps?: AuthMiddlewareDeps;
}

export function createUserRoutes(deps: UserRoutesDeps = {}) {
  const controller = createUserController(deps.userService);

  return new Elysia({ prefix: '/api/users' })
    .onRequest((ctx) => {
      const { pathname } = new URL(ctx.request.url);
      if (
        ctx.request.method === 'POST' &&
        (pathname === '/api/users' || pathname === '/api/users/')
      ) {
        return authLimiter(ctx);
      }
      return undefined;
    })
    .post('/', ({ body, set }) => controller.postUser({ body, set }), {
      body: createUserSchema,
      detail: {
        tags: ['Users'],
        summary: 'Registrasi user baru',
        responses: {
          201: { description: 'User berhasil dibuat' },
          400: { description: 'Email atau Username sudah digunakan' },
        },
      },
    })
    .guard({}, (app) =>
      app
        .use(createAuthMiddleware(deps.authMiddlewareDeps))
        .get(
          '/me',
          ({ user, set }) =>
            successResponse(set, 'Profil berhasil dimuat', user),
          {
            detail: {
              tags: ['Users'],
              summary: 'Mendapatkan profil user yang sedang login',
              security: [{ bearerAuth: [] }],
              responses: {
                200: { description: 'Profil berhasil dimuat' },
                401: { description: 'Unauthorized' },
              },
            },
          },
        )
        .get('/', ({ set }) => controller.getAllUsers({ set }), {
          beforeHandle: ({ user }) => {
            requireRole(user, ['ADMIN']);
          },
          detail: {
            tags: ['Users'],
            summary: 'Mendapatkan semua daftar user (Hanya Admin)',
            security: [{ bearerAuth: [] }],
            responses: {
              200: { description: 'Daftar user berhasil dimuat' },
              403: { description: 'Forbidden (Bukan Admin)' },
            },
          },
        }),
    );
}

export const userRoutes = createUserRoutes();

export default userRoutes;
