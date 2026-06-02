const subforumService = require('../../services/subforumService');
const { successResponse } = require('../../utils/response');

const postSubforum = async (req, res, next) => {
  try {
    const subforum = await subforumService.createSubforum(req.body);

    return successResponse(res, 'Subforum berhasil dibuat', subforum, 201);
  } catch (error) {
    next(error);
  }
};


const getSubforums = async (req, res, next) => {
  try {
    const subforums = await subforumService.getAllSubforums();
    return successResponse(res, 'Daftar subforum berhasil dimuat', subforums);
  } catch (error) {
    next(error); 
  }
};

const getSubforumBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const subforum = await subforumService.getSubforumBySlug(slug);
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