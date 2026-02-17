const subforumService = require('../../services/subforumService');

const getAll = async (req, res) => {
  try {
    const subforums = await subforumService.getSubforumList();
    
    res.status(200).json({
      status: 'success',
      data: subforums
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getAll
};