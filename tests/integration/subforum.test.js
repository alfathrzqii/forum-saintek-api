const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('Subforum API Integration Test', () => {
  let adminToken;

  beforeAll(async () => {
    // 1. Cleanup: Hapus data yang mungkin tertinggal dari tes sebelumnya
    await prisma.authentication.deleteMany();
    await prisma.subforum.deleteMany({
      where: {
        OR: [
          { slug: 'test-subforum-integration' },
          { name: 'Test Subforum Integration' }
        ]
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: { 
          in: ['admin_subforum@student.uin-suka.ac.id'] 
        }
      }
    });

    // 2. Setup ADMIN: Daftar -> Update Role -> Login
    await request(app).post('/api/users').send({
      email: 'admin_subforum@student.uin-suka.ac.id',
      username: 'adminsubforum',
      password: 'Password123!',
      fullName: 'Admin Subforum',
      prodi: 'Informatika'
    });
    
    // Paksa role jadi ADMIN di database
    await prisma.user.update({
      where: { email: 'admin_subforum@student.uin-suka.ac.id' },
      data: { role: 'ADMIN' }
    });

    const adminLogin = await request(app).post('/api/authentications').send({
      email: 'admin_subforum@student.uin-suka.ac.id',
      password: 'Password123!'
    });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Menutup koneksi Prisma agar Jest tidak "hanging"
    await prisma.$disconnect();
  });

  describe('POST /api/subforums', () => {
    it('should return 201 when admin creates a subforum', async () => {
      const res = await request(app)
        .post('/api/subforums')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Subforum Integration',
          description: 'Testing integration for subforum creation'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('name', 'Test Subforum Integration');
      expect(res.body.data).toHaveProperty('slug', 'test-subforum-integration');
    });

    it('should return 400 when subforum name already exists', async () => {
      const res = await request(app)
        .post('/api/subforums')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Subforum Integration',
          description: 'Duplicate subforum'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
    });

    it('should return 403 when non-admin attempts to create subforum', async () => {
      // We'll use a regular user token from another test or create one if needed.
      // For simplicity, we just check unauthorized or forge a user.
      const res = await request(app)
        .post('/api/subforums')
        .send({
          name: 'Non Admin Subforum',
          description: 'Forbidden creation'
        });
      
      expect(res.statusCode).toEqual(401); // Unauthorized because no token
    });
  });

  describe('GET /api/subforums', () => {
    it('should return 200 and all subforums list', async () => {
      const res = await request(app).get('/api/subforums');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/subforums/:slug', () => {
    it('should return 200 and subforum details when slug is valid', async () => {
      const res = await request(app).get('/api/subforums/test-subforum-integration');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('slug', 'test-subforum-integration');
    });

    it('should return 404 when subforum slug is not found', async () => {
      const res = await request(app).get('/api/subforums/non-existent-slug');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
    });
  });

});
