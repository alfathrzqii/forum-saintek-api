const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('Comment API Integration Test', () => {
  let userToken;
  let threadId;

  beforeAll(async () => {
    // 1. Cleanup
    await prisma.authentication.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.thread.deleteMany();
    await prisma.subforum.deleteMany({ where: { slug: 'test-comment-subforum' } });
    await prisma.user.deleteMany({
      where: { email: 'user_comment@student.uin-suka.ac.id' }
    });

    // 2. Setup User & Login
    await request(app).post('/api/users').send({
      email: 'user_comment@student.uin-suka.ac.id',
      username: 'usercomment',
      password: 'Password123!',
      fullName: 'User Comment',
      prodi: 'Informatika'
    });

    const login = await request(app).post('/api/authentications').send({
      email: 'user_comment@student.uin-suka.ac.id',
      password: 'Password123!'
    });
    userToken = login.body.data.accessToken;

    // 3. Setup Subforum & Thread
    const subforum = await prisma.subforum.create({
      data: {
        name: 'Test Comment Subforum',
        slug: 'test-comment-subforum'
      }
    });

    const thread = await prisma.thread.create({
      data: {
        title: 'Thread for Comments',
        content: 'Content...',
        authorId: (await prisma.user.findUnique({ where: { email: 'user_comment@student.uin-suka.ac.id' } })).id,
        subforumId: subforum.id
      }
    });
    threadId = thread.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/comments', () => {
    it('should return 201 when user posts a root comment', async () => {
      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'This is a root comment',
          threadId: threadId
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('content', 'This is a root comment');
    });

    it('should return 201 when user replies to a comment', async () => {
      const rootComment = await prisma.comment.findFirst({ where: { content: 'This is a root comment' } });
      
      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'This is a reply',
          threadId: threadId,
          parentId: rootComment.id
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data).toHaveProperty('parentId', rootComment.id);
    });
  });

  describe('GET /api/comments/thread/:threadId', () => {
    it('should return 200 and nested comment structure', async () => {
      const res = await request(app).get(`/api/comments/thread/${threadId}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      
      // Check for nesting
      const root = res.body.data.find(c => c.content === 'This is a root comment');
      expect(root).toBeDefined();
      expect(root.replies.length).toBeGreaterThan(0);
      expect(root.replies[0]).toHaveProperty('content', 'This is a reply');
    });
  });
});
