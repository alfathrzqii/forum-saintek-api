const { z } = require('zod');

const createUserSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  username: z.string().min(3, { message: "Username minimal 3 karakter" }),
  password: z.string().min(8, { message: "Password minimal 8 karakter" }),
  fullName: z.string().min(3, { message: "Nama lengkap minimal 3 karakter" }).optional(),
  prodi: z.string().min(2, { message: "Prodi harus diisi" })
});

module.exports = { createUserSchema };