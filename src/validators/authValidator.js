const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(8, { message: "Password minimal 8 karakter" }),
  username: z.string().min(3, { message: "Username minimal 3 karakter" }),
  prodi: z.string().min(2, { message: "Prodi harus diisi" })
});

module.exports = {
  registerSchema
};