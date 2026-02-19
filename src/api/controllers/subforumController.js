const subforumService = require('../../services/subforumService');

const getAll = async (req, res, next) => {
  try {
    const subforums = await subforumService.getSubforumList();
    
    res.status(200).json({
      status: 'success',
      data: subforums
    });
  } catch (error) {
    next(error)
  }
};

module.exports = {
  getAll
};