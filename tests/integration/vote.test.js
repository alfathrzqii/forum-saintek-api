const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

describe('Vote API Integration Test', () => {
  let userToken;
  let threadId;

  beforeAll(async () => {
    // 1. Cleanup
    await prisma.authentication.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.thread.deleteMany();
    await prisma.subforum.deleteMany({ where: { slug: 'test-vote-subforum' } });
    await prisma.user.deleteMany({
      where: { email: 'user_vote@student.uin-suka.ac.id' }
    });

    // 2. Setup User & Login
    await request(app).post('/api/users').send({
      email: 'user_vote@student.uin-suka.ac.id',
      username: 'uservote',
      password: 'Password123!',
      fullName: 'User Vote',
      prodi: 'Informatika'
    });

    const login = await request(app).post('/api/authentications').send({
      email: 'user_vote@student.uin-suka.ac.id',
      password: 'Password123!'
    });
    userToken = login.body.data.accessToken;

    // 3. Setup Subforum & Thread
    const subforum = await prisma.subforum.create({
      data: {
        name: 'Test Vote Subforum',
        slug: 'test-vote-subforum'
      }
    });

    const thread = await prisma.thread.create({
      data: {
        title: 'Thread for Voting',
        content: 'Content...',
        authorId: (await prisma.user.findUnique({ where: { email: 'user_vote@student.uin-suka.ac.id' } })).id,
        subforumId: subforum.id
      }
    });
    threadId = thread.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/votes', () => {
    it('should return 200 and create a vote when user upvotes a thread', async () => {
      const res = await request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'UPVOTE',
          threadId: threadId
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toContain('berhasil');
    });

    it('should return 200 and delete a vote when user upvotes the same thread twice (Toggle)', async () => {
      const res = await request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'UPVOTE',
          threadId: threadId
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/dihapus/i);
    });

    it('should return 200 and update vote when user changes from UPVOTE to DOWNVOTE', async () => {
      // First upvote
      await request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ type: 'UPVOTE', threadId: threadId });

      // Then downvote
      const res = await request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'DOWNVOTE',
          threadId: threadId
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/diperbarui/i);
    });

    it('should return 400 when voting without threadId or commentId', async () => {
      const res = await request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ type: 'UPVOTE' });

      expect(res.statusCode).toEqual(400);
    });
  });
});
