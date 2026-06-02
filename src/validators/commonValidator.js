const { z } = require('zod');

const uuidSchema = z.string().uuid({ message: 'ID tidak valid (harus UUID)' });

const idParamSchema = z.object({
  id: uuidSchema,
});

const threadIdParamSchema = z.object({
  threadId: uuidSchema,
});

const commentIdParamSchema = z.object({
  commentId: uuidSchema,
});

module.exports = {
  uuidSchema,
  idParamSchema,
  threadIdParamSchema,
  commentIdParamSchema,
};
