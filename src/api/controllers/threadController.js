const threadService = require('../../services/threadService');
const { successResponse } = require('../../utils/response');


const postThread = async (req, res, next) => {
  try {
    const context = { userId: req.user.id, role: req.user.role };
    const thread = await threadService.createThread(context, req.body);

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

const getThreadById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const thread = await threadService.getThreadById(id);

    return successResponse(res, 'Detail thread berhasil dimuat', thread);
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
  getThreadById,
  deleteThread,
};