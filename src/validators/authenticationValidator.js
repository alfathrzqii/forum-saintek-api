const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(1, { message: "Password harus diisi" })
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, { message: "Refresh token harus ada" })
});

module.exports = {
  loginSchema,
  refreshTokenSchema
};