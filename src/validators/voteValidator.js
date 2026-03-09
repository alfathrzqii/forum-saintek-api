const { z } = require('zod');

const voteSchema = z.object({
  type: z.enum(['UPVOTE', 'DOWNVOTE']),
  threadId: z.string().uuid().optional().nullable(),
  commentId: z.string().uuid().optional().nullable(),
}).refine(data => data.threadId || data.commentId, {
  message: "Harus memilih antara threadId atau commentId untuk di-vote",
});

module.exports = { voteSchema };