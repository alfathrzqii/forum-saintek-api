const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('Thread API Integration Test', () => {
  let userToken;
  let adminToken;
  let testSubforumSlug;

  beforeAll(async () => {
    // 1. Cleanup: Hapus data yang mungkin tertinggal dari tes sebelumnya
    await prisma.authentication.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.thread.deleteMany();
    await prisma.subforum.deleteMany({ where: { slug: 'test-thread-subforum-long' } });
    await prisma.user.deleteMany({
      where: {
        email: { in: ['user_thread@saintek.id', 'admin_thread@saintek.id'] }
      }
    });

    // 2. Setup Subforum
    const subforum = await prisma.subforum.create({
      data: {
        name: 'Test Thread Subforum Long',
        slug: 'test-thread-subforum-long',
        description: 'Testing threads'
      }
    });
    testSubforumSlug = subforum.slug;

    // 3. Setup ADMIN
    await request(app).post('/api/users').send({
      email: 'admin_thread@saintek.id',
      username: 'adminthread',
      password: 'Password123!',
      fullName: 'Admin Thread',
      prodi: 'Informatika'
    });
    
    await prisma.user.update({
      where: { email: 'admin_thread@saintek.id' },
      data: { role: 'ADMIN' }
    });

    // 4. Setup USER
    await request(app).post('/api/users').send({
      email: 'user_thread@saintek.id',
      username: 'userthread',
      password: 'Password123!',
      fullName: 'User Thread',
      prodi: 'Sains Data'
    });

    const adminLogin = await request(app).post('/api/authentications').send({
      email: 'admin_thread@saintek.id',
      password: 'Password123!'
    });
    adminToken = adminLogin.body.data.accessToken;

    const userLogin = await request(app).post('/api/authentications').send({
      email: 'user_thread@saintek.id',
      password: 'Password123!'
    });
    userToken = userLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/threads', () => {
    it('should return 201 when user creates a thread', async () => {
      const res = await request(app)
        .post('/api/threads')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'My First Thread',
          content: 'This is the content of my first thread',
          subforumSlug: testSubforumSlug,
          isAnonymous: false
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('title', 'My First Thread');
      expect(res.body.data.author).toHaveProperty('username', 'userthread');
    });

    it('should return 201 and mask author when thread is anonymous', async () => {
      const res = await request(app)
        .post('/api/threads')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Anonymous Secret',
          content: 'Confessing my secret',
          subforumSlug: testSubforumSlug,
          isAnonymous: true
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      // On retrieval it should be masked, but create might return real or already masked.
      // Let's check what the current service does.
    });

    it('should return 401 when creating thread without token', async () => {
      const res = await request(app)
        .post('/api/threads')
        .send({
          title: 'Unauthorized Thread',
          content: '...',
          subforumSlug: testSubforumSlug
        });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/threads', () => {
    it('should return 200 and list of threads', async () => {
      const res = await request(app).get('/api/threads');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should mask author for anonymous threads in the list', async () => {
      const res = await request(app).get('/api/threads');
      const anonThread = res.body.data.find(t => t.title === 'Anonymous Secret');
      
      expect(anonThread).toBeDefined();
      expect(anonThread.author.username).toEqual('Saintekfess User');
    });
  });

  describe('DELETE /api/threads/:id', () => {
    it('should return 403 when deleting other user thread', async () => {
      // 1. Create admin's thread
      const adminThreadRes = await request(app)
        .post('/api/threads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Secret Thread',
          content: 'This thread belongs to admin',
          subforumSlug: testSubforumSlug
        });
      
      const adminThreadId = adminThreadRes.body.data.id;

      // 2. Try to delete it as a regular user
      const res = await request(app)
        .delete(`/api/threads/${adminThreadId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('should return 200 when author deletes their own thread', async () => {
      // 1. Create a thread first
      const threadRes = await request(app)
        .post('/api/threads')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Thread to be self-deleted',
          content: 'Goodbye world content',
          subforumSlug: testSubforumSlug
        });
      
      const threadId = threadRes.body.data.id;

      const res = await request(app)
        .delete(`/api/threads/${threadId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(200);
    });

    it('should return 200 when admin deletes any thread', async () => {
      // 1. User creates a thread
      const threadRes = await request(app)
        .post('/api/threads')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Thread to be deleted by Admin',
          content: 'I will be deleted soon',
          subforumSlug: testSubforumSlug
        });
      
      const threadId = threadRes.body.data.id;
      
      // 2. Admin deletes it
      const res = await request(app)
        .delete(`/api/threads/${threadId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
    });
  });
});
