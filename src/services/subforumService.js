const subforumRepository = require('../repositories/subforumRepository');

const getSubforumList = async () => {
  // Di sini bisa ditambahin logika lain nanti (misal: caching)
  return await subforumRepository.getAllSubforums();
};

module.exports = {
  getSubforumList
};