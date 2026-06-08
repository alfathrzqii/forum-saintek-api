const { z } = require('zod');

const loginSchema = z.object({
  identifier: z.string().min(3, { message: "Email atau username minimal 3 karakter" }),
  password: z.string().min(1, { message: "Password harus diisi" })
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, { message: "Refresh token harus ada" })
});

module.exports = {
  loginSchema,
  refreshTokenSchema
};