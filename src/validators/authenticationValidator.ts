import { t } from 'elysia';

export const loginSchema = t.Object({
  identifier: t.String({
    minLength: 3,
    error: 'Email atau username minimal 3 karakter',
  }),
  password: t.String({
    minLength: 1,
    error: 'Password harus diisi',
  }),
});

export const refreshTokenSchema = t.Object({
  refreshToken: t.String({
    minLength: 1,
    error: 'Refresh token harus ada',
  }),
});
