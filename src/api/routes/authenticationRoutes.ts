import { Elysia } from 'elysia';
import type { AuthenticationService } from '../../services/authenticationService.ts';
import {
  loginSchema,
  refreshTokenSchema,
} from '../../validators/authenticationValidator.ts';
import { createAuthenticationController } from '../controllers/authenticationController.ts';
import { authLimiter } from '../middlewares/rateLimitMiddleware.ts';

export interface AuthenticationRoutesDeps {
  authenticationService?: AuthenticationService;
}

export function createAuthenticationRoutes(
  deps: AuthenticationRoutesDeps = {},
) {
  const controller = createAuthenticationController(deps.authenticationService);

  return new Elysia({ prefix: '/api/authentications' })
    .onRequest((ctx) => {
      const { pathname } = new URL(ctx.request.url);
      if (
        ctx.request.method === 'POST' &&
        (pathname === '/api/authentications' ||
          pathname === '/api/authentications/')
      ) {
        return authLimiter(ctx);
      }
      return undefined;
    })
    .post('/', ({ body, set }) => controller.postAuthentication({ body, set }), {
      body: loginSchema,
      detail: {
        tags: ['Authentications'],
        summary: 'Login user',
        responses: {
          201: { description: 'Login berhasil' },
          401: { description: 'Kredensial tidak valid' },
        },
      },
    })
    .put('/', ({ body, set }) => controller.putAuthentication({ body, set }), {
      body: refreshTokenSchema,
      detail: {
        tags: ['Authentications'],
        summary: 'Refresh Access Token',
        responses: {
          200: { description: 'Token berhasil diperbarui' },
          400: { description: 'Refresh token tidak valid' },
        },
      },
    })
    .delete(
      '/',
      ({ body, set }) => controller.deleteAuthentication({ body, set }),
      {
        body: refreshTokenSchema,
        detail: {
          tags: ['Authentications'],
          summary: 'Logout user',
          responses: {
            200: { description: 'Logout berhasil' },
          },
        },
      },
    );
}

export const authenticationRoutes = createAuthenticationRoutes();

export default authenticationRoutes;
