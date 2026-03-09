const prisma = require('../utils/prisma');

const getExistingVote = async (userId, target) => {
  return await prisma.vote.findFirst({
    where: {
      userId,
      OR: [
        { threadId: target.threadId || undefined },
        { commentId: target.commentId || undefined }
      ]
    }
  });
};

const upsertVote = async (userId, data) => {
  // Kita gunakan ID unik gabungan jika sudah ada, atau buat baru
  return await prisma.vote.create({
    data: { ...data, userId }
  });
};

const deleteVote = async (id) => {
  return await prisma.vote.delete({ where: { id } });
};

const updateVoteType = async (id, type) => {
  return await prisma.vote.update({
    where: { id },
    data: { type }
  });
};

module.exports = { getExistingVote, upsertVote, deleteVote, updateVoteType };