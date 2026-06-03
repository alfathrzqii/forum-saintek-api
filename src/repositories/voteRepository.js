const prisma = require('../utils/prisma');

const getExistingVote = async (userId, target, tx = prisma) => {
  return await tx.vote.findFirst({
    where: {
      userId,
      OR: [
        { threadId: target.threadId || undefined },
        { commentId: target.commentId || undefined }
      ]
    }
  });
};

const upsertVote = async (userId, data, tx = prisma) => {
  // Kita gunakan ID unik gabungan jika sudah ada, atau buat baru
  return await tx.vote.create({
    data: { ...data, userId }
  });
};

const deleteVote = async (id, tx = prisma) => {
  return await tx.vote.delete({ where: { id } });
};

const updateVoteType = async (id, type, tx = prisma) => {
  return await tx.vote.update({
    where: { id },
    data: { type }
  });
};

module.exports = { getExistingVote, upsertVote, deleteVote, updateVoteType };