const commentService = require('../../services/commentService');
const { createCommentSchema } = require('../../validators/commentValidator');

const postComment = async (req, res, next) => {
  try {
    const validatedData = createCommentSchema.parse(req.body);
    const comment = await commentService.createComment(req.user.id, validatedData);

    res.status(201).json({
      status: 'success',
      message: 'Komentar berhasil ditambahkan',
      data: comment
    });
  } catch (error) {
    next(error);
  }
};

const getComments = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    const comments = await commentService.getThreadComments(threadId);

    res.json({
      status: 'success',
      data: comments
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { postComment, getComments };