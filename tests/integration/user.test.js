const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('User Resource (Registration)', () => {
  beforeAll(async () => {
    // Bersihkan tabel User sebelum tes (Gunakan dengan hati-hati!)
    await prisma.user.deleteMany({
        where: { email: 'test_auto@saintek.id' }
    });
  });

  describe('POST /api/users', () => {
    it('should return 201 and create a new user', async () => {
      const newUser = {
        email: 'test_auto@saintek.id',
        username: 'autotester',
        password: 'Password123!',
        fullName: 'Auto Tester',
        prodi: 'Informatika'
      };

      const res = await request(app).post('/api/users').send(newUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body.data).toHaveProperty('username', 'autotester');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 400 if email already exists', async () => {
      await request(app).post('/api/users').send({
        email: 'test_auto@saintek.id',
        username: 'beda_username',
        password: 'Password123!',
        prodi: 'Sains Data'
      });

      const res = await request(app).post('/api/users').send({
        email: 'test_auto@saintek.id',
        username: 'username_lain',
        password: 'Password123!',
        prodi: 'Sains Data'
      });

      expect(res.statusCode).toEqual(400);
    });
  });
});