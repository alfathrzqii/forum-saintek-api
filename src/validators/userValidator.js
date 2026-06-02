const { z } = require('zod');

const createUserSchema = z.object({
  email: z.string()
    .email({ message: "Format email tidak valid" })
    .regex(/[a-z0-9._%+-]+@[a-z0-9.-]+\.ac\.id$/, { message: "Email harus menggunakan domain universitas (.ac.id)" }),
  username: z.string()
    .min(3, { message: "Username minimal 3 karakter" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Username hanya boleh berisi huruf, angka, dan underscore" }),
  password: z.string().min(8, { message: "Password minimal 8 karakter" }),
  fullName: z.string().min(3, { message: "Nama lengkap minimal 3 karakter" }).optional(),
  prodi: z.string().min(2, { message: "Prodi harus diisi" })
});

module.exports = { createUserSchema };