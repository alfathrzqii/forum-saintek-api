const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');
const bcrypt = require('bcrypt');

describe('Authentication Resource (Session)', () => {
  let refreshToken = '';

  beforeAll(async () => {
    // 1. Bersihkan sisa tes lama
    await prisma.authentication.deleteMany();
    await prisma.user.deleteMany({ where: { email: 'login_test@saintek.id' } });

    // 2. Buat user khusus untuk tes login ini
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: {
        email: 'login_test@saintek.id',
        username: 'logintester',
        password: hashedPassword,
        fullName: 'Login Tester',
        prodi: 'Sains Data'
      }
    });
  });

  describe('POST /api/authentications', () => {
    it('should return 201 and tokens for valid credentials', async () => {
      const res = await request(app).post('/api/authentications').send({
        email: 'test_auto@saintek.id',
        password: 'Password123!'
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      refreshToken = res.body.data.refreshToken;
    });
  });

  describe('PUT /api/authentications', () => {
    it('should return 200 and new access token', async () => {
      const res = await request(app).post('/api/authentications').send({
        email: 'test_auto@saintek.id',
        password: 'Password123!'
      });
      const rt = res.body.data.refreshToken;

      const refreshRes = await request(app)
        .put('/api/authentications')
        .send({ refreshToken: rt });

      expect(refreshRes.statusCode).toEqual(200);
      expect(refreshRes.body.data).toHaveProperty('accessToken');
    });
  });

  describe('DELETE /api/authentications', () => {
    it('should return 200 and logout successfully', async () => {
      const res = await request(app)
        .delete('/api/authentications')
        .send({ refreshToken });

      expect(res.statusCode).toEqual(200);
    });
  });
});