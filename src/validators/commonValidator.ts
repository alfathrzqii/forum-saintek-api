import { t } from 'elysia';

export const uuidSchema = t.String({
  format: 'uuid',
  error: 'ID tidak valid (harus UUID)',
});

export const idParamSchema = t.Object({
  id: uuidSchema,
});

export const threadIdParamSchema = t.Object({
  threadId: uuidSchema,
});

export const commentIdParamSchema = t.Object({
  commentId: uuidSchema,
});
