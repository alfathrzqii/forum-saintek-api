const { z } = require('zod');

const voteSchema = z.object({
  type: z.enum(['UPVOTE', 'DOWNVOTE']),
  threadId: z.string().uuid().optional().nullable(),
  commentId: z.string().uuid().optional().nullable(),
}).refine(data => (data.threadId && !data.commentId) || (!data.threadId && data.commentId), {
  message: "Harus memilih salah satu saja, antara threadId atau commentId",
});

module.exports = { voteSchema };