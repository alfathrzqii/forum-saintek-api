const threadService = require('../../services/threadService');
const { createThreadSchema } = require('../../validators/threadValidator');
const { successResponse } = require('../../utils/response');

const postThread = async (req, res, next) => {
  try {
    const validatedData = createThreadSchema.parse(req.body);

    const context = { userId: req.user.id, role: req.user.role };
    const thread = await threadService.createThread(context, validatedData);

    return successResponse(res, 'Thread berhasil dipublikasikan', thread, 201);
  } catch (error) {
    next(error);
  }
};

const getThreads = async (req, res, next) => {
  try {
    const { subforum } = req.query; 
    const threads = await threadService.getAllThreads(subforum);

    return successResponse(res, 'Daftar thread berhasil dimuat', threads);
  } catch (error) {
    next(error);
  }
};

const deleteThread = async (req, res, next) => {
  try {
    const { id } = req.params;
    const context = { userId: req.user.id, role: req.user.role };
    await threadService.deleteThread(id, context);

    return successResponse(res, 'Thread berhasil dihapus');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  postThread,
  getThreads,
  deleteThread,
};