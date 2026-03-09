const voteService = require('../../services/voteService');
const { voteSchema } = require('../../validators/voteValidator');

const toggleVote = async (req, res, next) => {
  try {
    // 1. Validasi skema (Zod)
    const validatedData = voteSchema.parse(req.body);

    // 2. Eksekusi logika toggle di Service
    const result = await voteService.toggleVote(req.user.id, validatedData);

    // 3. Berikan feedback yang spesifik
    let message = 'Vote berhasil diberikan';
    if (result.action === 'deleted') message = 'Vote berhasil dihapus';
    if (result.action === 'updated') message = 'Vote berhasil diperbarui';

    res.json({
      status: 'success',
      message,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { toggleVote };