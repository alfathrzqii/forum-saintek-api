const voteRepository = require('../repositories/voteRepository');

const toggleVote = async (context, { type, threadId, commentId }) => {
  const { userId } = context;
  const existingVote = await voteRepository.getExistingVote(userId, { threadId, commentId });

  if (existingVote) {
    // 1. Jika tipenya sama, user membatalkan vote (Toggle Off)
    if (existingVote.type === type) {
      await voteRepository.deleteVote(existingVote.id);
      return { action: 'deleted' };
    }
    
    // 2. Jika tipenya beda, user pindah haluan (Up to Down atau sebaliknya)
    await voteRepository.updateVoteType(existingVote.id, type);
    return { action: 'updated' };
  }

  // 3. Jika belum ada, buat vote baru
  await voteRepository.upsertVote(userId, { type, threadId, commentId });
  return { action: 'created' };
};

module.exports = { toggleVote };