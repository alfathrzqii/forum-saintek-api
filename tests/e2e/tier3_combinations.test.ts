import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  cleanupE2EData,
  closeE2EDb,
  deleteUserById,
  ensureSeededSubforums,
} from './helpers/db.ts';
import {
  createAdminSession,
  createTracker,
  loginUser,
  registerAndLogin,
  registerUser,
  uniqueId,
} from './helpers/fixtures.ts';
import { createHttpClient, type HttpClient } from './helpers/http.ts';
import { ensureE2EServer, type E2EServerHandle } from './helpers/server.ts';

interface SubforumSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count: { threads: number };
}

interface ThreadItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  isAnonymous: boolean;
  authorId: string | null;
  createdAt: string;
  author: {
    id?: string | null;
    username: string;
    fullName: string;
    prodi?: string;
  };
  subforum: {
    name: string;
    slug: string;
  };
  _count: {
    comments: number;
    votes: number;
  };
}

interface CommentNode {
  id: string;
  content: string;
  threadId: string;
  parentId: string | null;
  authorId: string | null;
  createdAt: string;
  author: {
    id?: string | null;
    username: string;
    fullName: string;
  };
  _count: {
    votes: number;
  };
  replies: CommentNode[];
}

let server: E2EServerHandle;
let baseClient: HttpClient;
const tracker = createTracker();

const t3Ip = (group: number, sub = 1): string => `10.205.${group}.${sub}`;

beforeAll(async () => {
  server = await ensureE2EServer();
  await ensureSeededSubforums();
  baseClient = createHttpClient(server.baseUrl);
});

afterAll(async () => {
  try {
    await cleanupE2EData(tracker);
  } finally {
    try {
      await closeE2EDb();
    } finally {
      if (server) {
        await server.stop();
      }
    }
  }
});

describe('Tier 3 — Cross-Feature Pairwise Combinations (T3-01..T3-14)', () => {
  it('T3-01 (F3+F4+F5): Register -> Login by username -> /api/users/me -> Refresh token -> Old & new tokens work -> Logout -> Refresh fails', async () => {
    const ip = t3Ip(1, 1);
    const { payload, user, response: regRes } = await registerUser(
      baseClient,
      tracker,
      { prodi: 'Sains Data' },
      ip,
    );

    expect(regRes.status).toBe(201);
    expect(regRes.body?.status).toBe('success');
    expect(regRes.body?.message).toBe('User berhasil didaftarkan');
    expect(user.prodi).toBe('Sains Data');
    expect(user.role).toBe('USER');

    const { accessToken, refreshToken, response: loginRes } = await loginUser(
      baseClient,
      tracker,
      payload.username,
      payload.password,
      ip,
    );
    expect(loginRes.status).toBe(201);
    expect(loginRes.body?.message).toBe('Authentication berhasil ditambahkan');

    const meRes = await baseClient.get('/api/users/me', {
      ip,
      token: accessToken,
    });
    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({
      status: 'success',
      message: 'Profil berhasil dimuat',
      data: {
        id: user.id,
        email: payload.email,
        username: payload.username,
        fullName: payload.fullName,
        role: 'USER',
        prodi: 'Sains Data',
      },
    });
    expect('password' in meRes.body.data).toBe(false);
    expect('createdAt' in meRes.body.data).toBe(false);

    await Bun.sleep(1100);

    const refreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken },
      { ip },
    );
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body?.status).toBe('success');
    expect(refreshRes.body?.message).toBe('Access Token berhasil diperbarui');
    const newAccessToken = refreshRes.body?.data?.accessToken as string;
    expect(typeof newAccessToken).toBe('string');
    expect(newAccessToken).not.toBe(accessToken);

    const oldMeRes = await baseClient.get('/api/users/me', {
      ip,
      token: accessToken,
    });
    expect(oldMeRes.status).toBe(200);
    expect(oldMeRes.body?.data?.id).toBe(user.id);

    const newMeRes = await baseClient.get('/api/users/me', {
      ip,
      token: newAccessToken,
    });
    expect(newMeRes.status).toBe(200);
    expect(newMeRes.body?.data?.id).toBe(user.id);

    const logoutRes = await baseClient.del(
      '/api/authentications',
      { refreshToken },
      { ip },
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({
      status: 'success',
      message: 'Refresh token berhasil dihapus (Logout berhasil)',
    });
    expect('data' in logoutRes.body).toBe(false);

    const revokedRefreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken },
      { ip },
    );
    expect(revokedRefreshRes.status).toBe(400);
    expect(revokedRefreshRes.body).toEqual({
      status: 'error',
      message: 'Refresh token tidak valid',
    });
  });

  it('T3-02 (F3+F5+F6): USER blocked on POST /api/subforums (403) -> ADMIN creates subforum -> GET /api/subforums reflects it', async () => {
    const ip = t3Ip(2, 1);
    const regularUser = await registerAndLogin(baseClient, tracker, {}, ip);
    const admin = await createAdminSession(baseClient, tracker, {}, ip);

    const subforumName = `Teknik Robotika ${uniqueId('sf').slice(-6)}`;
    const expectedSlug = subforumName.toLowerCase().split(' ').join('-');

    const forbiddenRes = await baseClient.post(
      '/api/subforums',
      { name: subforumName, description: 'Diskusi robotika' },
      { ip, token: regularUser.accessToken },
    );
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body).toEqual({
      status: 'error',
      message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    });

    const createRes = await baseClient.post(
      '/api/subforums',
      { name: subforumName, description: 'Diskusi robotika' },
      { ip, token: admin.accessToken },
    );
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.data.id as string;
    const createdSlug = createRes.body.data.slug as string;
    tracker.subforumIds.push(createdId);
    tracker.subforumSlugs.push(createdSlug ?? expectedSlug);

    expect(createRes.body).toEqual({
      status: 'success',
      message: 'Subforum berhasil dibuat',
      data: {
        id: expect.any(String),
        name: subforumName,
        slug: expectedSlug,
        description: 'Diskusi robotika',
      },
    });
    expect('_count' in createRes.body.data).toBe(false);

    const listRes = await baseClient.get('/api/subforums', { ip });
    expect(listRes.status).toBe(200);
    expect(listRes.body?.status).toBe('success');
    expect(listRes.body?.message).toBe('Daftar subforum berhasil dimuat');

    const subforums = listRes.body.data as SubforumSummary[];
    const found = subforums.find((sf: SubforumSummary) => sf.slug === expectedSlug);
    expect(found).toEqual({
      id: createdId,
      name: subforumName,
      slug: expectedSlug,
      description: 'Diskusi robotika',
      _count: { threads: 0 },
    });
  });

  it('T3-03 (F6+F7): Create subforum -> Create threads inside it + control subforum -> ?subforum filters cleanly & _count.threads matches', async () => {
    const ip = t3Ip(3, 1);
    const admin = await createAdminSession(baseClient, tracker, {}, ip);
    const author = await registerAndLogin(baseClient, tracker, {}, ip);

    const subforumName = `Matematika Terapan ${uniqueId('sf').slice(-6)}`;
    const sfRes = await baseClient.post(
      '/api/subforums',
      { name: subforumName, description: 'Subforum T3-03' },
      { ip, token: admin.accessToken },
    );
    expect(sfRes.status).toBe(201);
    const newId = sfRes.body.data.id as string;
    const newSlug = sfRes.body.data.slug as string;
    tracker.subforumIds.push(newId);
    tracker.subforumSlugs.push(newSlug);

    const t1Res = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Pertama ${uniqueId('t1').slice(-6)}`,
        content: 'Konten thread pertama pada subforum baru.',
        subforumSlug: newSlug,
      },
      { ip, token: author.accessToken },
    );
    expect(t1Res.status).toBe(201);
    const t1Id = t1Res.body.data.id as string;
    tracker.threadIds.push(t1Id);

    const t2Res = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Kedua ${uniqueId('t2').slice(-6)}`,
        content: 'Konten thread kedua pada subforum baru.',
        subforumSlug: newSlug,
      },
      { ip, token: author.accessToken },
    );
    expect(t2Res.status).toBe(201);
    const t2Id = t2Res.body.data.id as string;
    tracker.threadIds.push(t2Id);

    const controlRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Kontrol ${uniqueId('tc').slice(-6)}`,
        content: 'Konten thread kontrol di informatika.',
        subforumSlug: 'informatika',
      },
      { ip, token: author.accessToken },
    );
    expect(controlRes.status).toBe(201);
    const controlId = controlRes.body.data.id as string;
    tracker.threadIds.push(controlId);

    const filteredRes = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: newSlug },
    });
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body?.status).toBe('success');
    expect(filteredRes.body?.message).toBe('Daftar thread berhasil dimuat');

    const filteredThreads = filteredRes.body.data as ThreadItem[];
    expect(filteredThreads).toHaveLength(2);
    expect(filteredThreads.every((t: ThreadItem) => t.subforum.slug === newSlug)).toBe(true);
    const filteredIds = filteredThreads.map((t: ThreadItem) => t.id);
    expect(filteredIds).toContain(t1Id);
    expect(filteredIds).toContain(t2Id);
    expect(filteredIds).not.toContain(controlId);

    const detailSfRes = await baseClient.get(`/api/subforums/${newSlug}`, { ip });
    expect(detailSfRes.status).toBe(200);
    expect(detailSfRes.body).toEqual({
      status: 'success',
      message: 'Detail subforum berhasil dimuat',
      data: {
        id: newId,
        name: subforumName,
        slug: newSlug,
        description: 'Subforum T3-03',
        _count: { threads: 2 },
      },
    });
  });

  it('T3-04 (F7+F10): Create thread -> 2 root comments + 2 nested replies -> _count.comments === 4 & comment tree accurate', async () => {
    const ip = t3Ip(4, 1);
    const userA = await registerAndLogin(baseClient, tracker, {}, ip);
    const userB = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Diskusi Nested ${uniqueId('t4').slice(-6)}`,
        content: 'Thread untuk menguji komentar bertingkat T3-04.',
        subforumSlug: 'informatika',
      },
      { ip, token: userA.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const r1Res = await baseClient.post(
      '/api/comments',
      { content: 'Root 1', threadId },
      { ip, token: userA.accessToken },
    );
    expect(r1Res.status).toBe(201);
    const root1Id = r1Res.body.data.id as string;
    tracker.commentIds.push(root1Id);
    expect(r1Res.body?.data?.parentId).toBeNull();

    const r2Res = await baseClient.post(
      '/api/comments',
      { content: 'Root 2', threadId },
      { ip, token: userB.accessToken },
    );
    expect(r2Res.status).toBe(201);
    const root2Id = r2Res.body.data.id as string;
    tracker.commentIds.push(root2Id);
    expect(r2Res.body?.data?.parentId).toBeNull();

    const rep1Res = await baseClient.post(
      '/api/comments',
      { content: 'Reply to Root 1', threadId, parentId: root1Id },
      { ip, token: userB.accessToken },
    );
    expect(rep1Res.status).toBe(201);
    const reply1Id = rep1Res.body.data.id as string;
    tracker.commentIds.push(reply1Id);
    expect(rep1Res.body?.data?.parentId).toBe(root1Id);

    const rep2Res = await baseClient.post(
      '/api/comments',
      { content: 'Reply to Root 2', threadId, parentId: root2Id },
      { ip, token: userA.accessToken },
    );
    expect(rep2Res.status).toBe(201);
    const reply2Id = rep2Res.body.data.id as string;
    tracker.commentIds.push(reply2Id);
    expect(rep2Res.body?.data?.parentId).toBe(root2Id);

    const detailRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?._count).toEqual({ comments: 4, votes: 0 });

    const commentsRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
      ip,
    });
    expect(commentsRes.status).toBe(200);
    expect(commentsRes.body?.status).toBe('success');
    expect(commentsRes.body?.message).toBe('Daftar komentar berhasil dimuat');

    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(2);
    expect(tree[0]?.id).toBe(root1Id);
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(reply1Id);
    expect(tree[0]?.replies[0]?.parentId).toBe(root1Id);
    expect(tree[0]?.replies[0]?.replies).toEqual([]);

    expect(tree[1]?.id).toBe(root2Id);
    expect(tree[1]?.replies).toHaveLength(1);
    expect(tree[1]?.replies[0]?.id).toBe(reply2Id);
    expect(tree[1]?.replies[0]?.parentId).toBe(root2Id);
    expect(tree[1]?.replies[0]?.replies).toEqual([]);
  });

  it('T3-05 (F7+F11): 3 users vote on thread (UPVOTE, UPVOTE, DOWNVOTE) -> _count.votes === 3 -> 1 toggles off -> _count.votes === 2', async () => {
    const ip = t3Ip(5, 1);
    const u1 = await registerAndLogin(baseClient, tracker, {}, ip);
    const u2 = await registerAndLogin(baseClient, tracker, {}, ip);
    const u3 = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Voting ${uniqueId('t5').slice(-6)}`,
        content: 'Konten thread untuk pengujian multi-user voting.',
        subforumSlug: 'informatika',
      },
      { ip, token: u1.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const v1 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip, token: u1.accessToken },
    );
    expect(v1.status).toBe(200);
    expect(v1.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const v2 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip, token: u2.accessToken },
    );
    expect(v2.status).toBe(200);
    expect(v2.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const v3 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', threadId },
      { ip, token: u3.accessToken },
    );
    expect(v3.status).toBe(200);
    expect(v3.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const afterThreeRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(afterThreeRes.status).toBe(200);
    expect(afterThreeRes.body?.data?._count?.votes).toBe(3);

    const toggleOffRes = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip, token: u2.accessToken },
    );
    expect(toggleOffRes.status).toBe(200);
    expect(toggleOffRes.body).toEqual({
      status: 'success',
      message: 'Vote berhasil dihapus',
      data: { action: 'deleted' },
    });

    const afterTwoRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(afterTwoRes.status).toBe(200);
    expect(afterTwoRes.body?.data?._count?.votes).toBe(2);
  });

  it('T3-06 (F10+F11): Independent voting across thread, root comment, and nested reply', async () => {
    const ip = t3Ip(6, 1);
    const u1 = await registerAndLogin(baseClient, tracker, {}, ip);
    const u2 = await registerAndLogin(baseClient, tracker, {}, ip);
    const u3 = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Comment Vote ${uniqueId('t6').slice(-6)}`,
        content: 'Menguji vote terpisah pada thread, komentar induk, dan balasan.',
        subforumSlug: 'informatika',
      },
      { ip, token: u1.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const rootRes = await baseClient.post(
      '/api/comments',
      { content: 'Komentar root T3-06', threadId },
      { ip, token: u2.accessToken },
    );
    expect(rootRes.status).toBe(201);
    const rootId = rootRes.body.data.id as string;
    tracker.commentIds.push(rootId);

    const replyRes = await baseClient.post(
      '/api/comments',
      { content: 'Balasan T3-06', threadId, parentId: rootId },
      { ip, token: u3.accessToken },
    );
    expect(replyRes.status).toBe(201);
    const replyId = replyRes.body.data.id as string;
    tracker.commentIds.push(replyId);

    const voteThread = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip, token: u1.accessToken },
    );
    expect(voteThread.status).toBe(200);
    expect(voteThread.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const voteRoot = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: rootId },
      { ip, token: u2.accessToken },
    );
    expect(voteRoot.status).toBe(200);
    expect(voteRoot.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const voteReplyCreate = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: replyId },
      { ip, token: u3.accessToken },
    );
    expect(voteReplyCreate.status).toBe(200);
    expect(voteReplyCreate.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const voteReplyUpdate = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', commentId: replyId },
      { ip, token: u3.accessToken },
    );
    expect(voteReplyUpdate.status).toBe(200);
    expect(voteReplyUpdate.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diperbarui',
      data: { action: 'updated' },
    });

    const detailRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?._count).toEqual({ comments: 2, votes: 1 });

    const commentsRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
      ip,
    });
    expect(commentsRes.status).toBe(200);
    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(rootId);
    expect(tree[0]?._count).toEqual({ votes: 1 });
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(replyId);
    expect(tree[0]?.replies[0]?._count).toEqual({ votes: 1 });
  });

  it('T3-07 (F8+F10): Soft-deleted thread returns 404 on GET /api/threads/:id and POST /api/comments while GET /api/comments/thread/:id preserves 200', async () => {
    const ip = t3Ip(7, 1);
    const user = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Soft Delete ${uniqueId('t7').slice(-6)}`,
        content: 'Thread yang akan dihapus lunak setelah dikomentari.',
        subforumSlug: 'informatika',
      },
      { ip, token: user.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const commentRes = await baseClient.post(
      '/api/comments',
      { content: 'Comment before delete', threadId },
      { ip, token: user.accessToken },
    );
    expect(commentRes.status).toBe(201);
    const commentId = commentRes.body.data.id as string;
    tracker.commentIds.push(commentId);

    const delRes = await baseClient.del(`/api/threads/${threadId}`, undefined, {
      ip,
      token: user.accessToken,
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({
      status: 'success',
      message: 'Thread berhasil dihapus',
    });
    expect('data' in delRes.body).toBe(false);

    const getDeletedRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(getDeletedRes.status).toBe(404);
    expect(getDeletedRes.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });

    const newCommentRes = await baseClient.post(
      '/api/comments',
      { content: 'Comment after delete', threadId },
      { ip, token: user.accessToken },
    );
    expect(newCommentRes.status).toBe(404);
    expect(newCommentRes.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });

    const existingCommentsRes = await baseClient.get(
      `/api/comments/thread/${threadId}`,
      { ip },
    );
    expect(existingCommentsRes.status).toBe(200);
    expect(existingCommentsRes.body?.status).toBe('success');
    expect(existingCommentsRes.body?.message).toBe('Daftar komentar berhasil dimuat');
    const comments = existingCommentsRes.body.data as CommentNode[];
    expect(comments).toHaveLength(1);
    expect(comments[0]?.id).toBe(commentId);
    expect(comments[0]?.content).toBe('Comment before delete');
  });

  it('T3-08 (F8+F6): Soft-delete omits thread from GET /api/threads?subforum=<slug> while _count.threads retains count (main parity)', async () => {
    const ip = t3Ip(8, 1);
    const admin = await createAdminSession(baseClient, tracker, {}, ip);

    const subforumName = `Subforum Count ${uniqueId('sc').slice(-6)}`;
    const sfRes = await baseClient.post(
      '/api/subforums',
      { name: subforumName, description: 'Count parity test' },
      { ip, token: admin.accessToken },
    );
    expect(sfRes.status).toBe(201);
    const sfId = sfRes.body.data.id as string;
    const slug = sfRes.body.data.slug as string;
    tracker.subforumIds.push(sfId);
    tracker.subforumSlugs.push(slug);

    const beforeSf = await baseClient.get(`/api/subforums/${slug}`, { ip });
    expect(beforeSf.status).toBe(200);
    expect(beforeSf.body?.data?._count?.threads).toBe(0);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Count Parity ${uniqueId('t8').slice(-6)}`,
        content: 'Menguji perilaku _count.threads setelah soft delete.',
        subforumSlug: slug,
      },
      { ip, token: admin.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const activeSf = await baseClient.get(`/api/subforums/${slug}`, { ip });
    expect(activeSf.status).toBe(200);
    expect(activeSf.body?.data?._count?.threads).toBe(1);

    const activeFeed = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: slug },
    });
    expect(activeFeed.status).toBe(200);
    expect(activeFeed.body.data).toHaveLength(1);
    expect(activeFeed.body.data[0].id).toBe(threadId);

    const delRes = await baseClient.del(`/api/threads/${threadId}`, undefined, {
      ip,
      token: admin.accessToken,
    });
    expect(delRes.status).toBe(200);

    const afterDeleteFeed = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: slug },
    });
    expect(afterDeleteFeed.status).toBe(200);
    expect(afterDeleteFeed.body.data).toEqual([]);

    const afterDeleteSf = await baseClient.get(`/api/subforums/${slug}`, { ip });
    expect(afterDeleteSf.status).toBe(200);
    expect(afterDeleteSf.body?.data?._count?.threads).toBe(1);
  });

  it('T3-09 (F9+F10+F11): Anonymous thread + comments + replies + votes mask author identity while updating counts accurately', async () => {
    const ip = t3Ip(9, 1);
    const author = await registerAndLogin(
      baseClient,
      tracker,
      { prodi: 'Bioteknologi' },
      ip,
    );
    const commenter = await registerAndLogin(baseClient, tracker, {}, ip);
    const replier = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Curhat Anonim ${uniqueId('t9').slice(-6)}`,
        content: 'Isi curhatan panjang minimal sepuluh karakter.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      },
      { ip, token: author.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadData = threadRes.body.data as ThreadItem;
    tracker.threadIds.push(threadData.id);
    expect(threadData.isAnonymous).toBe(true);
    expect(threadData.authorId).toBeNull();
    expect(threadData.author).toEqual({
      id: null,
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });

    const rootRes = await baseClient.post(
      '/api/comments',
      { content: 'Komentar anonim 1', threadId: threadData.id },
      { ip, token: commenter.accessToken },
    );
    expect(rootRes.status).toBe(201);
    const rootCommentId = rootRes.body.data.id as string;
    tracker.commentIds.push(rootCommentId);
    expect(rootRes.body.data.authorId).toBeNull();
    expect(rootRes.body.data.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });

    const replyRes = await baseClient.post(
      '/api/comments',
      {
        content: 'Balasan anonim 1',
        threadId: threadData.id,
        parentId: rootCommentId,
      },
      { ip, token: replier.accessToken },
    );
    expect(replyRes.status).toBe(201);
    const replyId = replyRes.body.data.id as string;
    tracker.commentIds.push(replyId);
    expect(replyRes.body.data.authorId).toBeNull();
    expect(replyRes.body.data.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });

    const voteThread = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId: threadData.id },
      { ip, token: author.accessToken },
    );
    expect(voteThread.status).toBe(200);
    expect(voteThread.body?.data).toEqual({ action: 'created' });

    const voteRoot = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: rootCommentId },
      { ip, token: replier.accessToken },
    );
    expect(voteRoot.status).toBe(200);
    expect(voteRoot.body?.data).toEqual({ action: 'created' });

    const voteReply = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: replyId },
      { ip, token: commenter.accessToken },
    );
    expect(voteReply.status).toBe(200);
    expect(voteReply.body?.data).toEqual({ action: 'created' });

    const feedRes = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: 'saintekfess' },
    });
    expect(feedRes.status).toBe(200);
    const feedItem = (feedRes.body.data as ThreadItem[]).find(
      (t: ThreadItem) => t.id === threadData.id,
    );
    expect(feedItem).toBeDefined();
    expect(feedItem?.authorId).toBeNull();
    expect(feedItem?.author).toEqual({
      id: null,
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });
    expect(feedItem?._count).toEqual({ comments: 2, votes: 1 });

    for (const token of [undefined, author.accessToken]) {
      const detailRes = await baseClient.get(`/api/threads/${threadData.id}`, {
        ip,
        ...(token ? { token } : {}),
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.authorId).toBeNull();
      expect(detailRes.body.data.author).toEqual({
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
        prodi: 'Bioteknologi',
      });
      expect(detailRes.body.data._count).toEqual({ comments: 2, votes: 1 });
    }

    const commentsRes = await baseClient.get(
      `/api/comments/thread/${threadData.id}`,
      { ip },
    );
    expect(commentsRes.status).toBe(200);
    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(rootCommentId);
    expect(tree[0]?.authorId).toBeNull();
    expect(tree[0]?.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });
    expect(tree[0]?._count).toEqual({ votes: 1 });
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(replyId);
    expect(tree[0]?.replies[0]?.authorId).toBeNull();
    expect(tree[0]?.replies[0]?.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });
    expect(tree[0]?.replies[0]?._count).toEqual({ votes: 1 });
    expect(tree[0]?.replies[0]?.replies).toEqual([]);
  });

  it('T3-10 (F9+F8+F5): Anonymous thread -> Author (USER) blocked from deleting (403) -> ADMIN deletes (200) -> Vanishes from feed', async () => {
    const ip = t3Ip(10, 1);
    const author = await registerAndLogin(baseClient, tracker, {}, ip);
    const admin = await createAdminSession(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Anon Moderasi ${uniqueId('t10').slice(-6)}`,
        content: 'Thread anonim yang hanya dapat dihapus oleh ADMIN.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      },
      { ip, token: author.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const authorDeleteRes = await baseClient.del(
      `/api/threads/${threadId}`,
      undefined,
      { ip, token: author.accessToken },
    );
    expect(authorDeleteRes.status).toBe(403);
    expect(authorDeleteRes.body).toEqual({
      status: 'error',
      message: 'Anda tidak berhak menghapus thread ini',
    });

    const adminDeleteRes = await baseClient.del(
      `/api/threads/${threadId}`,
      undefined,
      { ip, token: admin.accessToken },
    );
    expect(adminDeleteRes.status).toBe(200);
    expect(adminDeleteRes.body).toEqual({
      status: 'success',
      message: 'Thread berhasil dihapus',
    });
    expect('data' in adminDeleteRes.body).toBe(false);

    const allFeed = await baseClient.get('/api/threads', { ip });
    expect(allFeed.status).toBe(200);
    expect(
      (allFeed.body.data as ThreadItem[]).some((t: ThreadItem) => t.id === threadId),
    ).toBe(false);

    const sfFeed = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: 'saintekfess' },
    });
    expect(sfFeed.status).toBe(200);
    expect(
      (sfFeed.body.data as ThreadItem[]).some((t: ThreadItem) => t.id === threadId),
    ).toBe(false);

    const detailRes = await baseClient.get(`/api/threads/${threadId}`, { ip });
    expect(detailRes.status).toBe(404);
    expect(detailRes.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });
  });

  it('T3-11 (F4+F5): Deleting user row yields 401 Ghost User on protected endpoints while PUT /api/authentications stays 200 (tracked for cleanup)', async () => {
    const ip = t3Ip(11, 1);
    const session = await registerAndLogin(baseClient, tracker, {}, ip);

    await deleteUserById(session.user.id);

    const meRes = await baseClient.get('/api/users/me', {
      ip,
      token: session.accessToken,
    });
    expect(meRes.status).toBe(401);
    expect(meRes.body).toEqual({
      status: 'error',
      message: 'User sudah tidak terdaftar atau akun telah dihapus',
    });

    const createThreadRes = await baseClient.post(
      '/api/threads',
      {
        title: 'Ghost Thread',
        content: 'Should be rejected by auth middleware',
        subforumSlug: 'informatika',
      },
      { ip, token: session.accessToken },
    );
    expect(createThreadRes.status).toBe(401);
    expect(createThreadRes.body).toEqual({
      status: 'error',
      message: 'User sudah tidak terdaftar atau akun telah dihapus',
    });

    const refreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: session.refreshToken },
      { ip },
    );
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body?.status).toBe('success');
    expect(refreshRes.body?.message).toBe('Access Token berhasil diperbarui');
    const refreshedAccessToken = refreshRes.body?.data?.accessToken as string;
    expect(typeof refreshedAccessToken).toBe('string');

    const refreshedMeRes = await baseClient.get('/api/users/me', {
      ip,
      token: refreshedAccessToken,
    });
    expect(refreshedMeRes.status).toBe(401);
    expect(refreshedMeRes.body).toEqual({
      status: 'error',
      message: 'User sudah tidak terdaftar atau akun telah dihapus',
    });

    expect(tracker.tokens).toContain(session.refreshToken);
  });

  it(
    'T3-12 (F2+F4+F7): Exhausting authLimiter and globalLimiter on dedicated IPs does not interfere with unrelated IPs',
    async () => {
      const ipA = '10.251.31.1';
      const ipB1 = t3Ip(12, 1);
      const ipC = '10.251.32.1';
      const ipB2 = t3Ip(12, 2);

      for (let i = 0; i < 10; i += 1) {
        const failRes = await baseClient.post(
          '/api/authentications',
          { identifier: 'nobody_t3_12', password: 'wrongpassword' },
          { ip: ipA },
        );
        expect(failRes.status).toBe(401);
      }

      const authBlockedRes = await baseClient.post(
        '/api/authentications',
        { identifier: 'nobody_t3_12', password: 'wrongpassword' },
        { ip: ipA },
      );
      expect(authBlockedRes.status).toBe(429);
      expect(authBlockedRes.body).toEqual({
        status: 'fail',
        message: 'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
      });

      const session1 = await registerAndLogin(baseClient, tracker, {}, ipB1);
      const thread1Res = await baseClient.post(
        '/api/threads',
        {
          title: 'Thread from IP B1',
          content: 'Rate limit isolation verified for authLimiter',
          subforumSlug: 'informatika',
        },
        { ip: ipB1, token: session1.accessToken },
      );
      expect(thread1Res.status).toBe(201);
      tracker.threadIds.push(thread1Res.body.data.id as string);

      for (let i = 0; i < 100; i += 1) {
        const okRes = await baseClient.get('/api', { ip: ipC });
        expect(okRes.status).toBe(200);
      }

      const globalBlockedRes = await baseClient.get('/api', { ip: ipC });
      expect(globalBlockedRes.status).toBe(429);
      expect(globalBlockedRes.body).toEqual({
        status: 'fail',
        message:
          'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit',
      });

      const listB2 = await baseClient.get('/api/threads', { ip: ipB2 });
      expect(listB2.status).toBe(200);

      const session2 = await registerAndLogin(baseClient, tracker, {}, ipB2);
      const thread2Res = await baseClient.post(
        '/api/threads',
        {
          title: 'Thread from IP B2',
          content: 'Rate limit isolation verified for globalLimiter',
          subforumSlug: 'informatika',
        },
        { ip: ipB2, token: session2.accessToken },
      );
      expect(thread2Res.status).toBe(201);
      tracker.threadIds.push(thread2Res.body.data.id as string);
    },
    20_000,
  );

  it('T3-13 (F1+F6+F7): Health/root endpoints stay 200 and 404 or unknown ?subforum= reads do not mutate state', async () => {
    const ip = t3Ip(13, 1);
    const user = await registerAndLogin(baseClient, tracker, {}, ip);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Baseline ${uniqueId('t13').slice(-6)}`,
        content: 'Baseline thread untuk memverifikasi pembacaan 404 tidak mengubah state.',
        subforumSlug: 'informatika',
      },
      { ip, token: user.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const rootBefore = await baseClient.get('/api', { ip });
    expect(rootBefore.status).toBe(200);
    expect(rootBefore.body).toEqual({
      status: 'success',
      message: 'Selamat datang di API Forum SAINTEK!, Server is running perfectly.',
    });

    const healthBefore = await baseClient.get('/api/health', { ip });
    expect(healthBefore.status).toBe(200);
    expect(healthBefore.body?.data?.database).toBe('connected');

    const sfBefore = await baseClient.get('/api/subforums/informatika', { ip });
    expect(sfBefore.status).toBe(200);
    const beforeSubforumCount = sfBefore.body.data._count.threads as number;

    const feedBefore = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: 'informatika' },
    });
    expect(feedBefore.status).toBe(200);
    const beforeThreadIds = (feedBefore.body.data as ThreadItem[]).map(
      (t: ThreadItem) => t.id,
    );
    expect(beforeThreadIds).toContain(threadId);

    const unknownRoute = await baseClient.get('/api/unknown-t3-13?mut=1&foo=bar', {
      ip,
    });
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body).toEqual({
      status: 'error',
      message: 'Rute /api/unknown-t3-13?mut=1&foo=bar tidak ditemukan',
    });

    const unknownSubforum = await baseClient.get(
      '/api/subforums/subforum-tidak-ada-t3-13',
      { ip },
    );
    expect(unknownSubforum.status).toBe(404);
    expect(unknownSubforum.body).toEqual({
      status: 'error',
      message: 'Subforum tidak ditemukan',
    });

    const unknownThread = await baseClient.get(
      '/api/threads/00000000-0000-4000-8000-000000000000',
      { ip },
    );
    expect(unknownThread.status).toBe(404);
    expect(unknownThread.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });

    const fallbackFeed = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: 'slug-tidak-ada-t3-13' },
    });
    expect(fallbackFeed.status).toBe(200);
    expect(
      (fallbackFeed.body.data as ThreadItem[]).some((t: ThreadItem) => t.id === threadId),
    ).toBe(true);

    const rootAfter = await baseClient.get('/api', { ip });
    expect(rootAfter.status).toBe(200);

    const healthAfter = await baseClient.get('/api/health', { ip });
    expect(healthAfter.status).toBe(200);
    expect(healthAfter.body?.data?.database).toBe('connected');

    const sfAfter = await baseClient.get('/api/subforums/informatika', { ip });
    expect(sfAfter.status).toBe(200);
    expect(sfAfter.body?.data?._count?.threads).toBe(beforeSubforumCount);

    const feedAfter = await baseClient.get('/api/threads', {
      ip,
      query: { subforum: 'informatika' },
    });
    expect(feedAfter.status).toBe(200);
    const afterThreadIds = (feedAfter.body.data as ThreadItem[]).map(
      (t: ThreadItem) => t.id,
    );
    expect(afterThreadIds).toEqual(beforeThreadIds);
  });

  it('T3-14 (F3+F4+F7+F10): User A registers & logs in via username -> User B comments -> User A logs in via email & replies -> Both authors preserved', async () => {
    const ip = t3Ip(14, 1);
    const userA = await registerUser(baseClient, tracker, {}, ip);
    const loginAByUsername = await loginUser(
      baseClient,
      tracker,
      userA.payload.username,
      userA.payload.password,
      ip,
    );

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Dual Login ${uniqueId('t14').slice(-6)}`,
        content: 'Menguji login username lalu login ulang menggunakan email.',
        subforumSlug: 'informatika',
        isAnonymous: false,
      },
      { ip, token: loginAByUsername.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    const userB = await registerAndLogin(baseClient, tracker, {}, ip);
    const commentBRes = await baseClient.post(
      '/api/comments',
      { content: 'Komentar User B', threadId },
      { ip, token: userB.accessToken },
    );
    expect(commentBRes.status).toBe(201);
    const commentBId = commentBRes.body.data.id as string;
    tracker.commentIds.push(commentBId);

    await Bun.sleep(1100);

    const loginAByEmail = await loginUser(
      baseClient,
      tracker,
      userA.payload.email,
      userA.payload.password,
      ip,
    );

    const replyARes = await baseClient.post(
      '/api/comments',
      {
        content: 'Balasan User A',
        threadId,
        parentId: commentBId,
      },
      { ip, token: loginAByEmail.accessToken },
    );
    expect(replyARes.status).toBe(201);
    const replyAId = replyARes.body.data.id as string;
    tracker.commentIds.push(replyAId);

    const commentsRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
      ip,
    });
    expect(commentsRes.status).toBe(200);
    expect(commentsRes.body?.status).toBe('success');
    expect(commentsRes.body?.message).toBe('Daftar komentar berhasil dimuat');

    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(commentBId);
    expect(tree[0]?.authorId).toBe(userB.user.id);
    expect(tree[0]?.author).toEqual({
      username: userB.payload.username,
      fullName: userB.payload.fullName,
    });
    expect(tree[0]?.content).toBe('Komentar User B');

    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(replyAId);
    expect(tree[0]?.replies[0]?.parentId).toBe(commentBId);
    expect(tree[0]?.replies[0]?.authorId).toBe(userA.user.id);
    expect(tree[0]?.replies[0]?.author).toEqual({
      username: userA.payload.username,
      fullName: userA.payload.fullName,
    });
    expect(tree[0]?.replies[0]?.content).toBe('Balasan User A');
    expect(tree[0]?.replies[0]?.replies).toEqual([]);
  });
});
