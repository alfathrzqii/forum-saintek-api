const commentService = require('../../services/commentService');
const { createCommentSchema } = require('../../validators/commentValidator');
const { successResponse } = require('../../utils/response');

const postComment = async (req, res, next) => {
  try {
    const validatedData = createCommentSchema.parse(req.body);
    const context = { userId: req.user.id, role: req.user.role };
    const comment = await commentService.createComment(context, validatedData);

    return successResponse(res, 'Komentar berhasil ditambahkan', comment, 201);
  } catch (error) {
    next(error);
  }
};

const getComments = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    const comments = await commentService.getThreadComments(threadId);

    return successResponse(res, 'Daftar komentar berhasil dimuat', comments);
  } catch (error) {
    next(error);
  }
};

module.exports = { postComment, getComments };