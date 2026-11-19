import { t } from 'elysia';

export const createUserSchema = t.Object({
  email: t.Intersect([
    t.String({
      format: 'email',
      error: 'Format email tidak valid',
    }),
    t.String({
      pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.ac\\.id$',
      error: 'Email harus menggunakan domain universitas (.ac.id)',
    }),
  ]),
  username: t.Intersect([
    t.String({
      minLength: 3,
      error: 'Username minimal 3 karakter',
    }),
    t.String({
      pattern: '^[a-zA-Z0-9_]+$',
      error: 'Username hanya boleh berisi huruf, angka, dan underscore',
    }),
  ]),
  password: t.String({
    minLength: 8,
    error: 'Password minimal 8 karakter',
  }),
  fullName: t.Optional(
    t.String({
      minLength: 3,
      error: 'Nama lengkap minimal 3 karakter',
    }),
  ),
  prodi: t.String({
    minLength: 2,
    error: 'Prodi harus diisi',
  }),
});
