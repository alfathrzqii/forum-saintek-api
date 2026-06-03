const prisma = require('../utils/prisma');
const voteRepository = require('../repositories/voteRepository');

const toggleVote = async (context, { type, threadId, commentId }) => {
  const { userId } = context;

  return await prisma.$transaction(async (tx) => {
    const existingVote = await voteRepository.getExistingVote(userId, { threadId, commentId }, tx);

    if (existingVote) {
      // 1. Jika tipenya sama, user membatalkan vote (Toggle Off)
      if (existingVote.type === type) {
        await voteRepository.deleteVote(existingVote.id, tx);
        return { action: 'deleted' };
      }

      // 2. Jika tipenya beda, user pindah haluan (Up to Down atau sebaliknya)
      await voteRepository.updateVoteType(existingVote.id, type, tx);
      return { action: 'updated' };
    }

    // 3. Jika belum ada, buat vote baru
    await voteRepository.upsertVote(userId, { type, threadId, commentId }, tx);
    return { action: 'created' };
  });
};

module.exports = { toggleVote };