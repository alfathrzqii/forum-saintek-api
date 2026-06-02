const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('User Resource', () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    // 1. Cleanup: Hapus data yang mungkin tertinggal dari tes sebelumnya
    await prisma.authentication.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { 
          in: ['test_auto@student.uin-suka.ac.id', 'admin_test@student.uin-suka.ac.id', 'user_test@student.uin-suka.ac.id'] 
        }
      }
    });

    // 2. Setup ADMIN: Daftar -> Update Role -> Login
    await request(app).post('/api/users').send({
      email: 'admin_test@student.uin-suka.ac.id',
      username: 'admintester',
      password: 'Password123!',
      fullName: 'Admin Tester',
      prodi: 'Informatika'
    });
    
    // Paksa role jadi ADMIN di database
    await prisma.user.update({
      where: { email: 'admin_test@student.uin-suka.ac.id' },
      data: { role: 'ADMIN' }
    });

    const adminLogin = await request(app).post('/api/authentications').send({
      email: 'admin_test@student.uin-suka.ac.id',
      password: 'Password123!'
    });
    adminToken = adminLogin.body.data.accessToken;

    // 3. Setup REGULAR USER: Daftar -> Login
    await request(app).post('/api/users').send({
      email: 'user_test@student.uin-suka.ac.id',
      username: 'usertester',
      password: 'Password123!',
      fullName: 'User Tester',
      prodi: 'Sains Data'
    });

    const userLogin = await request(app).post('/api/authentications').send({
      email: 'user_test@student.uin-suka.ac.id',
      password: 'Password123!'
    });
    userToken = userLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Menutup koneksi Prisma agar Jest tidak "hanging"
    await prisma.$disconnect();
  });

  describe('POST /api/users (Registration)', () => {
    it('should return 201 and create a new user', async () => {
      const newUser = {
        email: 'test_auto@student.uin-suka.ac.id',
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
      // Data yang sama dengan test_auto@student.uin-suka.ac.id di atas
      const res = await request(app).post('/api/users').send({
        email: 'test_auto@student.uin-suka.ac.id',
        username: 'user_berbeda',
        password: 'Password123!',
        fullName: 'Nama Berbeda',
        prodi: 'Sains Data'
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
    });

    it('should return 400 if username already exists but email is new', async () => {
      const res = await request(app).post('/api/users').send({
        email: 'email_baru_sekali@student.uin-suka.ac.id',
        username: 'autotester',
        password: 'Password123!',
        fullName: 'User Baru',
        prodi: 'Sains Data'
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toMatch(/Username sudah digunakan/i);
    });
  });

  describe('GET /api/users/me (Profile Check)', () => {
    it('should return 200 and the current user profile', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      
      // Verifikasi data yang dikembalikan sesuai dengan user_test
      expect(res.body.data).toHaveProperty('email', 'user_test@student.uin-suka.ac.id');
      expect(res.body.data).toHaveProperty('username', 'usertester');
      
      // Pastikan password tidak ikut bocor ke client!
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 401 when accessing /me without token', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/users (Admin Feature)', () => {
    it('should return 200 and list of users for ADMIN', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      // Memastikan admin ada di dalam list
      expect(res.body.data.some(u => u.email === 'admin_test@student.uin-suka.ac.id')).toBe(true);
    });

    it('should return 403 (Forbidden) for regular USER', async () => {
      // Mengetes RoleMiddleware: User biasa tidak boleh akses list user
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toContain('Akses');
    });

    it('should return 401 (Unauthorized) when no token provided', async () => {
      // Mengetes AuthenticationMiddleware
      const res = await request(app).get('/api/users');
      
      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual('error');
    });

    it('should return 401 when token is invalid/malformed', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer token-ngawur');
      
      expect(res.statusCode).toEqual(401);
    });

    // Import service untuk di-mock
    const userService = require('../../src/services/userService');

    it('should return 500 when an unexpected error occurs (Internal Server Error)', async () => {
      // 1. "Sabotase" fungsi userService agar melempar error mentah
      const spy = jest.spyOn(userService, 'getAllUsers').mockImplementation(() => {
        throw new Error('Database meledak!'); 
      });

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`); // Pakai token admin agar lolos auth & role

      // 2. Ekspektasi: Ditangkap oleh fallback 500 di errorMiddleware
      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toContain('kegagalan pada server');

      // 3. Kembalikan fungsi ke aslinya agar tidak merusak tes lain
      spy.mockRestore();
    });
  });
});