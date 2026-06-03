const subforumService = require('../../services/subforumService');
const { successResponse } = require('../../utils/response');

const postSubforum = async (req, res, next) => {
  try {
    const context = { userId: req.user?.id, role: req.user?.role };
    const subforum = await subforumService.createSubforum(context, req.body);

    return successResponse(res, 'Subforum berhasil dibuat', subforum, 201);
  } catch (error) {
    next(error);
  }
};


const getSubforums = async (req, res, next) => {
  try {
    const context = { userId: req.user?.id, role: req.user?.role };
    const subforums = await subforumService.getAllSubforums(context);
    return successResponse(res, 'Daftar subforum berhasil dimuat', subforums);
  } catch (error) {
    next(error); 
  }
};

const getSubforumBySlug = async (req, res, next) => {
  try {
    const context = { userId: req.user?.id, role: req.user?.role };
    const { slug } = req.params;
    const subforum = await subforumService.getSubforumBySlug(context, slug);
    return successResponse(res, 'Detail subforum berhasil dimuat', subforum);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  postSubforum,
  getSubforums,
  getSubforumBySlug,
};