const { z } = require('zod');

const createCommentSchema = z.object({
  content: z.string()
    .min(1, "Komentar tidak boleh kosong")
    .max(2000, "Komentar maksimal 2000 karakter"),
  threadId: z.string().uuid("ID Thread tidak valid"),
  parentId: z.string().uuid("ID Parent tidak valid").optional().nullable(),
});

module.exports = { createCommentSchema };