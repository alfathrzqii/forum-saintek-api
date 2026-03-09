const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

jest.setTimeout(30000);

describe('Authentication Resource (Session)', () => {
  const testUser = {
    email: 'auth_test@saintek.id',
    username: 'authtester',
    password: 'Password123!',
    fullName: 'Auth Tester',
    prodi: 'Sains Data'
  };

  beforeAll(async () => {
    // 1. Bersihkan database dari data tes lama agar tidak konflik
    await prisma.authentication.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUser.email } });

    // 2. Siapkan User untuk dites loginnya (salt 1 agar cepat di test)
    const hashedPassword = await bcrypt.hash(testUser.password, 1);
    await prisma.user.create({
      data: {
        ...testUser,
        password: hashedPassword
      }
    });
  });

  // Bersihkan tabel token sebelum setiap skenario dijalankan
  beforeEach(async () => {
    await prisma.authentication.deleteMany();
  });

  describe('POST /api/authentications', () => {
    it('should return 201 and tokens for valid credentials', async () => {
      const res = await request(app)
        .post('/api/authentications')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/authentications')
        .send({
          email: testUser.email,
          password: 'WrongPassword'
        });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PUT /api/authentications', () => {
    it('should return 200 and new access token', async () => {
      // 1. Login dulu buat dapetin Refresh Token yang valid
      const loginRes = await request(app)
        .post('/api/authentications')
        .send({ email: testUser.email, password: testUser.password });
      
      const rt = loginRes.body.data.refreshToken;

      // 2. Tes Refresh Token-nya
      const res = await request(app)
        .put('/api/authentications')
        .send({ refreshToken: rt });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should return 400 when refresh token is not found in database', async () => {
      const validButNotPersistedToken = jwt.sign({ id: 'any' }, 'any_key');

      const res = await request(app)
        .put('/api/authentications')
        .send({ refreshToken: validButNotPersistedToken });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toMatch(/tidak valid/i);
    });

    it('should return 401 when token exists in DB but is expired/invalid', async () => {
      const junkToken = jwt.sign({ id: 'any' }, 'wrong_key');
      
      // Masukkan manual ke DB lewat prisma
      await prisma.authentication.create({ data: { token: junkToken } });

      const res = await request(app)
        .put('/api/authentications')
        .send({ refreshToken: junkToken });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('DELETE /api/authentications', () => {
    it('should return 200 and logout successfully', async () => {
      // 1. Login dulu buat dapetin token yang mau dihapus
      const loginRes = await request(app)
        .post('/api/authentications')
        .send({ email: testUser.email, password: testUser.password });
      
      const rt = loginRes.body.data.refreshToken;

      // 2. Tes Logout
      const res = await request(app)
        .delete('/api/authentications')
        .send({ refreshToken: rt });

      expect(res.statusCode).toEqual(200);
      
      // 3. Pastikan token beneran ilang di DB
      const tokenInDb = await prisma.authentication.findUnique({ where: { token: rt } });
      expect(tokenInDb).toBeNull();
    });

    it('should return 400 when refresh token is not found in database', async () => {
      const validButNotPersistedToken = jwt.sign({ id: 'any' }, 'any_key');

      const res = await request(app)
        .delete('/api/authentications')
        .send({ refreshToken: validButNotPersistedToken });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toMatch(/tidak valid/i);
    });
  });
});