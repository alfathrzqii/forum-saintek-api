import type { Context } from 'elysia';
import {
  authenticationService,
  type AuthenticationService,
  type LoginInput,
} from '../../services/authenticationService.ts';
import { successResponse } from '../../utils/response.ts';

type StatusSetter = Pick<Context['set'], 'status'>;

export function createAuthenticationController(
  service: AuthenticationService = authenticationService,
) {
  return {
    async postAuthentication({
      body,
      set,
    }: {
      body: LoginInput;
      set: StatusSetter;
    }) {
      const { identifier, password } = body;
      const tokens = await service.login({ identifier, password });

      return successResponse(
        set,
        'Authentication berhasil ditambahkan',
        tokens,
        201,
      );
    },

    async putAuthentication({
      body,
      set,
    }: {
      body: { refreshToken: string };
      set: StatusSetter;
    }) {
      const accessToken = await service.refresh(body.refreshToken);

      return successResponse(set, 'Access Token berhasil diperbarui', {
        accessToken,
      });
    },

    async deleteAuthentication({
      body,
      set,
    }: {
      body: { refreshToken: string };
      set: StatusSetter;
    }) {
      await service.logout(body.refreshToken);

      return successResponse(
        set,
        'Refresh token berhasil dihapus (Logout berhasil)',
        null,
      );
    },
  };
}

export const authenticationController = createAuthenticationController();

export default authenticationController;
