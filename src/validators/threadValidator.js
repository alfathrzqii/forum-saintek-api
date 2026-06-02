const { z } = require('zod');

const createThreadSchema = z.object({
  title: z.string()
    .min(5, "Judul minimal 5 karakter")
    .max(100, "Judul maksimal 100 karakter"),
  content: z.string()
    .min(10, "Konten minimal 10 karakter")
    .max(10000, "Konten maksimal 10000 karakter"),
  subforumSlug: z.string(), // Kita gunakan slug agar memudahkan integrasi URL
  isAnonymous: z.boolean().optional().default(false),
  imageUrl: z.string().url("Format URL gambar tidak valid").optional().nullable(),
});

module.exports = { createThreadSchema };