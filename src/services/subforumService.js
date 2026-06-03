const subforumRepository = require('../repositories/subforumRepository');
const InvariantError = require('../exceptions/InvariantError');
const NotFoundError = require('../exceptions/NotFoundError');

const prisma = require('../utils/prisma');

const createSubforum = async (context, { name, description }) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Cek apakah nama sudah ada
    const existing = await subforumRepository.getSubforumByName(name, tx);
    if (existing) {
      throw new InvariantError('Nama subforum sudah digunakan');
    }

    // 2. Buat slug sederhana (lowercase & ganti spasi jadi dash)
    const slug = name.toLowerCase().split(' ').join('-');

    return await subforumRepository.createSubforum({ name, slug, description }, tx);
  });
};

const getAllSubforums = async (context) => {
  return await subforumRepository.getAllSubforums();
};

const getSubforumBySlug = async (context, slug) => {
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