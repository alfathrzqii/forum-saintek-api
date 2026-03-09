const subforumRepository = require('../repositories/subforumRepository');
const InvariantError = require('../exceptions/InvariantError');
const NotFoundError = require('../exceptions/NotFoundError');

const createSubforum = async ({ name, description }) => {
  // 1. Cek apakah nama sudah ada
  const existing = await subforumRepository.getSubforumByName(name);
  if (existing) {
    throw new InvariantError('Nama subforum sudah digunakan');
  }

  // 2. Buat slug sederhana (lowercase & ganti spasi jadi dash)
  const slug = name.toLowerCase().split(' ').join('-');

  return await subforumRepository.createSubforum({ name, slug, description });
};

const getAllSubforums = async () => {
  return await subforumRepository.getAllSubforums();
};

const getSubforumBySlug = async (slug) => {
  const subforum = await subforumRepository.getSubforumBySlug(slug);
  if (!subforum) {
    throw new NotFoundError('Subforum tidak ditemukan');
  }
  return subforum;
};

module.exports = {
  createSubforum,
  getAllSubforums,
  getSubforumBySlug,
};