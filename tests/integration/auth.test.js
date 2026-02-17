const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('Auth API Integration Test', () => {
  // Bersihkan data user test setiap kali selesai tes agar tidak bentrok
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: 'tes@student.com' }
    });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should return 201 and create a new user', async () => {
      const newUser = {
        email: 'tes@student.com',
        username: 'mahasiswaganteng',
        password: 'Password123!',
        prodi: 'Sains Data'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('email', newUser.email);
      expect(res.body.data).not.toHaveProperty('password');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 and a token when credentials are valid', async () => {
      const credentials = {
        email: 'tes@student.com',
        password: 'Password123!'
      };

      const res = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('token');
    });

    it('should return 401 for invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tes@student.com', password: 'SalahPassword' });

      expect(res.statusCode).toEqual(401);
    });
  });
});