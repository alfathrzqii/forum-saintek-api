const voteService = require('../../services/voteService');
const { successResponse } = require('../../utils/response');

const toggleVote = async (req, res, next) => {
  try {
    // 1. Eksekusi logika toggle di Service
    const context = { userId: req.user.id, role: req.user.role };
    const result = await voteService.toggleVote(context, req.body);

    // 2. Berikan feedback yang spesifik
    let message = 'Vote berhasil diberikan';
    if (result.action === 'deleted') message = 'Vote berhasil dihapus';
    if (result.action === 'updated') message = 'Vote berhasil diperbarui';

    return successResponse(res, message, result);
  } catch (error) {
    next(error);
  }
};


module.exports = { toggleVote };