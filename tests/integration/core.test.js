const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');
const bcrypt = require('bcrypt');

describe('Core Infrastructure & Middleware', () => {
  const testUser = {
    email: 'core_test@student.uin-suka.ac.id',
    username: 'coretester',
    password: 'Password123!',
    fullName: 'Core Tester',
    prodi: 'Sains Data'
  };

  beforeAll(async () => {
    // Bersihkan data lama
    await prisma.authentication.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUser.email } });

    // Buat user untuk testing middleware
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    await prisma.user.create({
      data: { ...testUser, password: hashedPassword }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.$disconnect();
  });

  describe('GET /api (Health Check)', () => {
    it('should return 200 and success status', async () => {
      const res = await request(app).get('/api');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toContain('Selamat datang');
    });
  });

  describe('Global 404 Handler', () => {
    it('should return 404 JSON for non-existent routes', async () => {
      const res = await request(app).get('/api/v1/rute-yang-tidak-ada');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toMatch(/tidak ditemukan/);
    });
  });

  describe('Global Error Handler (Zod Validation)', () => {
    it('should catch ZodError and return 400 with clear message', async () => {
      // Mengirim data kosong ke registrasi yang butuh banyak field
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'salah-format' }); // Data tidak lengkap & email salah

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      // Memastikan pesan error dari Zod tertangkap
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('Authentication Middleware', () => {
    it('should return 401 if Authorization header is missing', async () => {
      const res = await request(app).get('/api/users/me');

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Token tidak ditemukan/);
    });

    it('should return 401 if token is invalid or fake', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer token-asal-asalan');

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Token tidak valid/);
    });

    it('should return 401 if user in token is deleted (Ghost User)', async () => {
      // 1. Login untuk ambil token
      const loginRes = await request(app).post('/api/authentications').send({
        email: testUser.email,
        password: testUser.password
      });
      const token = loginRes.body.data.accessToken;

      // 2. HAPUS USER DARI DATABASE (Simulasi akun dihapus admin)
      await prisma.user.delete({ where: { email: testUser.email } });

      // 3. Coba akses rute terproteksi
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/tidak terdaftar|dihapus/);
    });
  });
});