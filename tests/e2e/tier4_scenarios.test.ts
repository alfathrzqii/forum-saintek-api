import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  cleanupE2EData,
  closeE2EDb,
  deleteUserById,
  ensureSeededSubforums,
  SEEDED_SUBFORUMS,
  type SeededSubforumSpec,
} from './helpers/db.ts';
import {
  buildUserPayload,
  createAdminSession,
  createModeratorSession,
  createTracker,
  ipForGroup,
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

interface UserListItem {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  prodi: string;
  createdAt: string;
}

let server: E2EServerHandle;
let baseClient: HttpClient;
const tracker = createTracker();

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

describe('Tier 4 — Real-World Application Scenarios (T4-S1..T4-S7)', () => {
  it('T4-S1: Mahasiswa Baru Onboarding & Diskusi Akademik', async () => {
    const ip1 = ipForGroup(6, 1, 1);
    const ip2 = ipForGroup(6, 1, 2);

    // 1. Register student 1
    const student1 = await registerUser(
      baseClient,
      tracker,
      { prodi: 'Informatika' },
      ip1,
    );
    expect(student1.response.status).toBe(201);
    expect(student1.response.body?.status).toBe('success');
    expect(student1.response.body?.message).toBe('User berhasil didaftarkan');
    expect(student1.user.role).toBe('USER');
    expect(student1.user.prodi).toBe('Informatika');
    expect('password' in student1.response.body.data).toBe(false);

    // 2. Login via username
    const login1 = await loginUser(
      baseClient,
      tracker,
      student1.payload.username,
      student1.payload.password,
      ip1,
    );
    expect(login1.response.status).toBe(201);
    expect(login1.response.body?.message).toBe('Authentication berhasil ditambahkan');
    expect(login1.accessToken.split('.')).toHaveLength(3);
    expect(login1.refreshToken.split('.')).toHaveLength(3);

    // 3. Check /api/users/me
    const meRes = await baseClient.get('/api/users/me', {
      ip: ip1,
      token: login1.accessToken,
    });
    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({
      status: 'success',
      message: 'Profil berhasil dimuat',
      data: {
        id: student1.user.id,
        email: student1.payload.email,
        username: student1.payload.username,
        fullName: student1.payload.fullName,
        role: 'USER',
        prodi: 'Informatika',
      },
    });
    expect('password' in meRes.body.data).toBe(false);
    expect('createdAt' in meRes.body.data).toBe(false);

    // 4. Browse seeded subforums
    const subforumsRes = await baseClient.get('/api/subforums', { ip: ip1 });
    expect(subforumsRes.status).toBe(200);
    expect(subforumsRes.body?.status).toBe('success');
    expect(subforumsRes.body?.message).toBe('Daftar subforum berhasil dimuat');
    const subforums = subforumsRes.body.data as SubforumSummary[];
    const slugs = subforums.map((sf: SubforumSummary) => sf.slug);
    for (const seeded of SEEDED_SUBFORUMS as readonly SeededSubforumSpec[]) {
      expect(slugs).toContain(seeded.slug);
    }
    const names = subforums.map((sf: SubforumSummary) => sf.name);
    const sortedNames = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sortedNames);

    const infoSfRes = await baseClient.get('/api/subforums/informatika', { ip: ip1 });
    expect(infoSfRes.status).toBe(200);
    expect(infoSfRes.body?.message).toBe('Detail subforum berhasil dimuat');

    // 5. Create thread in informatika
    const threadTitle = `Diskusi KRS ${uniqueId('t4s1').slice(-6)}`;
    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: threadTitle,
        content: 'Halo senior, bagaimana alur pengisian KRS semester 1?',
        subforumSlug: 'informatika',
      },
      { ip: ip1, token: login1.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const thread = threadRes.body.data as ThreadItem;
    tracker.threadIds.push(thread.id);
    expect(threadRes.body?.message).toBe('Thread berhasil dipublikasikan');
    expect(thread).toEqual({
      id: expect.any(String),
      title: threadTitle,
      content: 'Halo senior, bagaimana alur pengisian KRS semester 1?',
      imageUrl: null,
      isAnonymous: false,
      authorId: student1.user.id,
      createdAt: expect.any(String),
      author: {
        username: student1.payload.username,
        fullName: student1.payload.fullName,
      },
      subforum: {
        name: 'Informatika',
        slug: 'informatika',
      },
      _count: {
        comments: 0,
        votes: 0,
      },
    });

    // 6. Student 2 registers & logs in
    const student2 = await registerAndLogin(
      baseClient,
      tracker,
      { prodi: 'Informatika' },
      ip2,
    );

    // 7. Student 2 comments & upvotes thread
    const c1Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Konsultasi dengan dosen PA terlebih dahulu ya!',
        threadId: thread.id,
      },
      { ip: ip2, token: student2.accessToken },
    );
    expect(c1Res.status).toBe(201);
    const c1Id = c1Res.body.data.id as string;
    tracker.commentIds.push(c1Id);
    expect(c1Res.body?.message).toBe('Komentar berhasil ditambahkan');
    expect(c1Res.body?.data?.parentId).toBeNull();
    expect(c1Res.body?.data?.threadId).toBe(thread.id);

    const voteRes = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId: thread.id },
      { ip: ip2, token: student2.accessToken },
    );
    expect(voteRes.status).toBe(200);
    expect(voteRes.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    // 8. Student 1 replies
    const r1Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Siap kak, terima kasih arahannya!',
        threadId: thread.id,
        parentId: c1Id,
      },
      { ip: ip1, token: login1.accessToken },
    );
    expect(r1Res.status).toBe(201);
    const r1Id = r1Res.body.data.id as string;
    tracker.commentIds.push(r1Id);
    expect(r1Res.body?.data?.parentId).toBe(c1Id);

    // 9. Student 1 refreshes token
    await Bun.sleep(1100);
    const refreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: login1.refreshToken },
      { ip: ip1 },
    );
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body?.status).toBe('success');
    expect(refreshRes.body?.message).toBe('Access Token berhasil diperbarui');
    const newAccessToken1 = refreshRes.body?.data?.accessToken as string;
    expect(typeof newAccessToken1).toBe('string');
    expect(newAccessToken1).not.toBe(login1.accessToken);

    // 10. Student 1 posts follow-up comment with newAccessToken1
    const c2Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Update: KRS sudah disetujui dosen PA!',
        threadId: thread.id,
      },
      { ip: ip1, token: newAccessToken1 },
    );
    expect(c2Res.status).toBe(201);
    const c2Id = c2Res.body.data.id as string;
    tracker.commentIds.push(c2Id);

    const detailRes = await baseClient.get(`/api/threads/${thread.id}`, { ip: ip1 });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?._count).toEqual({ comments: 3, votes: 1 });

    const commentsRes = await baseClient.get(`/api/comments/thread/${thread.id}`, {
      ip: ip1,
    });
    expect(commentsRes.status).toBe(200);
    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(2);
    expect(tree[0]?.id).toBe(c1Id);
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(r1Id);
    expect(tree[1]?.id).toBe(c2Id);

    // 11. Logout & verify revoked refresh token fails
    const logoutRes = await baseClient.del(
      '/api/authentications',
      { refreshToken: login1.refreshToken },
      { ip: ip1 },
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({
      status: 'success',
      message: 'Refresh token berhasil dihapus (Logout berhasil)',
    });
    expect('data' in logoutRes.body).toBe(false);

    const revokedRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: login1.refreshToken },
      { ip: ip1 },
    );
    expect(revokedRes.status).toBe(400);
    expect(revokedRes.body).toEqual({
      status: 'error',
      message: 'Refresh token tidak valid',
    });
  });

  it('T4-S2: Curhatan Anonim Saintekfess & Moderasi Admin', async () => {
    const ipConfessor = ipForGroup(6, 2, 1);
    const ipPeer1 = ipForGroup(6, 2, 2);
    const ipPeer2 = ipForGroup(6, 2, 3);
    const ipAdmin = ipForGroup(6, 2, 4);
    const ipVisitor = ipForGroup(6, 2, 5);

    const confessor = await registerAndLogin(
      baseClient,
      tracker,
      { prodi: 'Sains Data' },
      ipConfessor,
    );
    const peer1 = await registerAndLogin(baseClient, tracker, {}, ipPeer1);
    const peer2 = await registerAndLogin(baseClient, tracker, {}, ipPeer2);
    const admin = await createAdminSession(baseClient, tracker, {}, ipAdmin);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Curhat Lab ${uniqueId('fess').slice(-6)}`,
        content: 'Deadline laporan praktikum menumpuk minggu ini.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      },
      { ip: ipConfessor, token: confessor.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const thread = threadRes.body.data as ThreadItem;
    tracker.threadIds.push(thread.id);
    expect(thread.isAnonymous).toBe(true);
    expect(thread.authorId).toBeNull();
    expect(thread.author).toEqual({
      id: null,
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });

    const c1Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Semangat, kerjakan bertahap saja!',
        threadId: thread.id,
      },
      { ip: ipPeer1, token: peer1.accessToken },
    );
    expect(c1Res.status).toBe(201);
    const c1Id = c1Res.body.data.id as string;
    tracker.commentIds.push(c1Id);
    expect(c1Res.body.data.authorId).toBeNull();
    expect(c1Res.body.data.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });
    expect('id' in c1Res.body.data.author).toBe(false);

    const voteThreadRes = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId: thread.id },
      { ip: ipPeer1, token: peer1.accessToken },
    );
    expect(voteThreadRes.status).toBe(200);
    expect(voteThreadRes.body?.data).toEqual({ action: 'created' });

    const c2Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Betul, jangan lupa istirahat cukup!',
        threadId: thread.id,
        parentId: c1Id,
      },
      { ip: ipPeer2, token: peer2.accessToken },
    );
    expect(c2Res.status).toBe(201);
    const c2Id = c2Res.body.data.id as string;
    tracker.commentIds.push(c2Id);
    expect(c2Res.body.data.authorId).toBeNull();
    expect(c2Res.body.data.author).toEqual({
      username: 'Saintekfess User',
      fullName: 'Anonymous',
    });
    expect('id' in c2Res.body.data.author).toBe(false);

    const voteCommentRes = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c1Id },
      { ip: ipPeer2, token: peer2.accessToken },
    );
    expect(voteCommentRes.status).toBe(200);
    expect(voteCommentRes.body?.data).toEqual({ action: 'created' });

    // Visitor & Confessor verify anonymity across feed and detail
    for (const reqOpts of [
      { ip: ipVisitor },
      { ip: ipConfessor, token: confessor.accessToken },
    ]) {
      const feedRes = await baseClient.get('/api/threads', {
        ...reqOpts,
        query: { subforum: 'saintekfess' },
      });
      expect(feedRes.status).toBe(200);
      const item = (feedRes.body.data as ThreadItem[]).find(
        (t: ThreadItem) => t.id === thread.id,
      );
      expect(item).toBeDefined();
      expect(item?.authorId).toBeNull();
      expect(item?.author).toEqual({
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      expect(item?._count).toEqual({ comments: 2, votes: 1 });

      const detailRes = await baseClient.get(`/api/threads/${thread.id}`, reqOpts);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.authorId).toBeNull();
      expect(detailRes.body.data.author).toEqual({
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
        prodi: 'Sains Data',
      });
    }

    // Visitor & Peer 1 verify comment tree masking
    for (const reqOpts of [
      { ip: ipVisitor },
      { ip: ipPeer1, token: peer1.accessToken },
    ]) {
      const commentsRes = await baseClient.get(
        `/api/comments/thread/${thread.id}`,
        reqOpts,
      );
      expect(commentsRes.status).toBe(200);
      const tree = commentsRes.body.data as CommentNode[];
      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe(c1Id);
      expect(tree[0]?.authorId).toBeNull();
      expect(tree[0]?.author).toEqual({
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      expect('id' in (tree[0]?.author ?? {})).toBe(false);
      expect(tree[0]?._count).toEqual({ votes: 1 });

      expect(tree[0]?.replies).toHaveLength(1);
      expect(tree[0]?.replies[0]?.id).toBe(c2Id);
      expect(tree[0]?.replies[0]?.authorId).toBeNull();
      expect(tree[0]?.replies[0]?.author).toEqual({
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      expect('id' in (tree[0]?.replies[0]?.author ?? {})).toBe(false);
      expect(tree[0]?.replies[0]?._count).toEqual({ votes: 0 });
    }

    // Author blocked from deleting own anonymous thread (main parity)
    const authorDelRes = await baseClient.del(
      `/api/threads/${thread.id}`,
      undefined,
      { ip: ipConfessor, token: confessor.accessToken },
    );
    expect(authorDelRes.status).toBe(403);
    expect(authorDelRes.body).toEqual({
      status: 'error',
      message: 'Anda tidak berhak menghapus thread ini',
    });

    // Admin deletes thread
    const adminDelRes = await baseClient.del(
      `/api/threads/${thread.id}`,
      undefined,
      { ip: ipAdmin, token: admin.accessToken },
    );
    expect(adminDelRes.status).toBe(200);
    expect(adminDelRes.body).toEqual({
      status: 'success',
      message: 'Thread berhasil dihapus',
    });
    expect('data' in adminDelRes.body).toBe(false);

    // Post-delete checks
    const feedAfterDel = await baseClient.get('/api/threads', { ip: ipVisitor });
    expect(feedAfterDel.status).toBe(200);
    expect(
      (feedAfterDel.body.data as ThreadItem[]).some(
        (t: ThreadItem) => t.id === thread.id,
      ),
    ).toBe(false);

    const detailAfterDel = await baseClient.get(`/api/threads/${thread.id}`, {
      ip: ipVisitor,
    });
    expect(detailAfterDel.status).toBe(404);
    expect(detailAfterDel.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });

    const lateCommentRes = await baseClient.post(
      '/api/comments',
      { content: 'Komentar terlambat', threadId: thread.id },
      { ip: ipPeer1, token: peer1.accessToken },
    );
    expect(lateCommentRes.status).toBe(404);
    expect(lateCommentRes.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });
  });

  it('T4-S3: Admin Subforum Management & RBAC Audit', async () => {
    const ipUser = ipForGroup(6, 3, 1);
    const ipMod = ipForGroup(6, 3, 2);
    const ipAdmin = ipForGroup(6, 3, 3);

    const regularUser = await registerAndLogin(baseClient, tracker, {}, ipUser);
    const moderator = await createModeratorSession(baseClient, tracker, {}, ipMod);
    const admin = await createAdminSession(baseClient, tracker, {}, ipAdmin);

    // USER and MODERATOR blocked on GET /api/users & POST /api/subforums
    const userListDenied = await baseClient.get('/api/users', {
      ip: ipUser,
      token: regularUser.accessToken,
    });
    expect(userListDenied.status).toBe(403);
    expect(userListDenied.body).toEqual({
      status: 'error',
      message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    });

    const modListDenied = await baseClient.get('/api/users', {
      ip: ipMod,
      token: moderator.accessToken,
    });
    expect(modListDenied.status).toBe(403);
    expect(modListDenied.body).toEqual({
      status: 'error',
      message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    });

    const userSfDenied = await baseClient.post(
      '/api/subforums',
      { name: `Blocked ${uniqueId('u').slice(-6)}`, description: 'Test' },
      { ip: ipUser, token: regularUser.accessToken },
    );
    expect(userSfDenied.status).toBe(403);
    expect(userSfDenied.body).toEqual({
      status: 'error',
      message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    });

    const modSfDenied = await baseClient.post(
      '/api/subforums',
      { name: `Blocked ${uniqueId('m').slice(-6)}`, description: 'Test' },
      { ip: ipMod, token: moderator.accessToken },
    );
    expect(modSfDenied.status).toBe(403);
    expect(modSfDenied.body).toEqual({
      status: 'error',
      message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    });

    // Admin lists users
    const usersRes = await baseClient.get('/api/users', {
      ip: ipAdmin,
      token: admin.accessToken,
    });
    expect(usersRes.status).toBe(200);
    expect(usersRes.body?.status).toBe('success');
    expect(usersRes.body?.message).toBe('Daftar user berhasil dimuat');
    const userList = usersRes.body.data as UserListItem[];
    const userIds = userList.map((u: UserListItem) => u.id);
    expect(userIds).toContain(regularUser.user.id);
    expect(userIds).toContain(moderator.user.id);
    expect(userIds).toContain(admin.user.id);
    for (const u of userList) {
      expect('password' in u).toBe(false);
      expect(typeof u.createdAt).toBe('string');
    }

    // Admin creates unique Teknik Elektro subforum
    const suffix = uniqueId('te').slice(-8);
    const sfName = `Teknik Elektro ${suffix}`;
    const sfSlug = sfName.toLowerCase().split(' ').join('-');

    const createSfRes = await baseClient.post(
      '/api/subforums',
      {
        name: sfName,
        description: 'Forum resmi mahasiswa Teknik Elektro',
      },
      { ip: ipAdmin, token: admin.accessToken },
    );
    expect(createSfRes.status).toBe(201);
    const createdSfId = createSfRes.body.data.id as string;
    const createdSfSlug = createSfRes.body.data.slug as string;
    tracker.subforumIds.push(createdSfId);
    tracker.subforumSlugs.push(createdSfSlug ?? sfSlug);

    expect(createSfRes.body).toEqual({
      status: 'success',
      message: 'Subforum berhasil dibuat',
      data: {
        id: expect.any(String),
        name: sfName,
        slug: sfSlug,
        description: 'Forum resmi mahasiswa Teknik Elektro',
      },
    });
    expect('_count' in createSfRes.body.data).toBe(false);

    // Users create 2 threads in sfSlug
    const t1Res = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Pelanggar ${uniqueId('t1').slice(-6)}`,
        content: 'Thread yang melanggar aturan forum elektro.',
        subforumSlug: sfSlug,
      },
      { ip: ipUser, token: regularUser.accessToken },
    );
    expect(t1Res.status).toBe(201);
    const t1Id = t1Res.body.data.id as string;
    tracker.threadIds.push(t1Id);

    const t2Res = await baseClient.post(
      '/api/threads',
      {
        title: `Thread Resmi ${uniqueId('t2').slice(-6)}`,
        content: 'Diskusi jadwal praktikum rangkaian listrik.',
        subforumSlug: sfSlug,
      },
      { ip: ipMod, token: moderator.accessToken },
    );
    expect(t2Res.status).toBe(201);
    const t2Id = t2Res.body.data.id as string;
    tracker.threadIds.push(t2Id);

    const beforeFeed = await baseClient.get('/api/threads', {
      ip: ipAdmin,
      query: { subforum: sfSlug },
    });
    expect(beforeFeed.status).toBe(200);
    const beforeIds = (beforeFeed.body.data as ThreadItem[]).map(
      (t: ThreadItem) => t.id,
    );
    expect(beforeIds).toContain(t1Id);
    expect(beforeIds).toContain(t2Id);

    const beforeSf = await baseClient.get(`/api/subforums/${sfSlug}`, { ip: ipAdmin });
    expect(beforeSf.status).toBe(200);
    expect(beforeSf.body?.data?._count?.threads).toBe(2);

    // Admin soft-deletes violating thread t1
    const delRes = await baseClient.del(`/api/threads/${t1Id}`, undefined, {
      ip: ipAdmin,
      token: admin.accessToken,
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({
      status: 'success',
      message: 'Thread berhasil dihapus',
    });

    // Verify feed omits t1 while _count.threads retains 2 (main parity)
    const afterFeed = await baseClient.get('/api/threads', {
      ip: ipAdmin,
      query: { subforum: sfSlug },
    });
    expect(afterFeed.status).toBe(200);
    const afterIds = (afterFeed.body.data as ThreadItem[]).map(
      (t: ThreadItem) => t.id,
    );
    expect(afterIds).toEqual([t2Id]);

    const afterSf = await baseClient.get(`/api/subforums/${sfSlug}`, { ip: ipAdmin });
    expect(afterSf.status).toBe(200);
    expect(afterSf.body?.data?._count?.threads).toBe(2);

    const allSf = await baseClient.get('/api/subforums', { ip: ipAdmin });
    expect(allSf.status).toBe(200);
    const sfEntry = (allSf.body.data as SubforumSummary[]).find(
      (s: SubforumSummary) => s.slug === sfSlug,
    );
    expect(sfEntry?._count?.threads).toBe(2);
  });

  it('T4-S4: Multi-User Nested Debate & Vote Switching', async () => {
    const ipA = ipForGroup(6, 4, 1);
    const ipB = ipForGroup(6, 4, 2);
    const ipC = ipForGroup(6, 4, 3);

    const uA = await registerAndLogin(baseClient, tracker, {}, ipA);
    const uB = await registerAndLogin(baseClient, tracker, {}, ipB);
    const uC = await registerAndLogin(baseClient, tracker, {}, ipC);

    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Debat AI ${uniqueId('sd').slice(-6)}`,
        content: 'Apakah model transformer masih dominan tahun depan?',
        subforumSlug: 'sains-data',
      },
      { ip: ipA, token: uA.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const threadId = threadRes.body.data.id as string;
    tracker.threadIds.push(threadId);

    // Build 3-level nested comment tree
    const c1Res = await baseClient.post(
      '/api/comments',
      { content: 'Level 1: Masih dominan untuk NLP.', threadId },
      { ip: ipB, token: uB.accessToken },
    );
    expect(c1Res.status).toBe(201);
    const c1Id = c1Res.body.data.id as string;
    tracker.commentIds.push(c1Id);

    const c2Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Level 2: State-space models mulai mengejar.',
        threadId,
        parentId: c1Id,
      },
      { ip: ipC, token: uC.accessToken },
    );
    expect(c2Res.status).toBe(201);
    const c2Id = c2Res.body.data.id as string;
    tracker.commentIds.push(c2Id);

    const c3Res = await baseClient.post(
      '/api/comments',
      {
        content: 'Level 3: Hybrid attention + SSM sangat menjanjikan!',
        threadId,
        parentId: c2Id,
      },
      { ip: ipA, token: uA.accessToken },
    );
    expect(c3Res.status).toBe(201);
    const c3Id = c3Res.body.data.id as string;
    tracker.commentIds.push(c3Id);

    // uB on threadId: created -> updated -> deleted -> created (net 1)
    const tVote1 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip: ipB, token: uB.accessToken },
    );
    expect(tVote1.status).toBe(200);
    expect(tVote1.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const tVote2 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', threadId },
      { ip: ipB, token: uB.accessToken },
    );
    expect(tVote2.status).toBe(200);
    expect(tVote2.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diperbarui',
      data: { action: 'updated' },
    });

    const tVote3 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', threadId },
      { ip: ipB, token: uB.accessToken },
    );
    expect(tVote3.status).toBe(200);
    expect(tVote3.body).toEqual({
      status: 'success',
      message: 'Vote berhasil dihapus',
      data: { action: 'deleted' },
    });

    const tVote4 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', threadId },
      { ip: ipB, token: uB.accessToken },
    );
    expect(tVote4.status).toBe(200);
    expect(tVote4.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    // uC on c1Id: created -> updated -> deleted -> created (net 1)
    const c1Vote1 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c1Id },
      { ip: ipC, token: uC.accessToken },
    );
    expect(c1Vote1.status).toBe(200);
    expect(c1Vote1.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const c1Vote2 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', commentId: c1Id },
      { ip: ipC, token: uC.accessToken },
    );
    expect(c1Vote2.status).toBe(200);
    expect(c1Vote2.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diperbarui',
      data: { action: 'updated' },
    });

    const c1Vote3 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', commentId: c1Id },
      { ip: ipC, token: uC.accessToken },
    );
    expect(c1Vote3.status).toBe(200);
    expect(c1Vote3.body).toEqual({
      status: 'success',
      message: 'Vote berhasil dihapus',
      data: { action: 'deleted' },
    });

    const c1Vote4 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c1Id },
      { ip: ipC, token: uC.accessToken },
    );
    expect(c1Vote4.status).toBe(200);
    expect(c1Vote4.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    // uA on c2Id (created -> deleted, net 0), then uA on c3Id (created -> updated, net 1)
    const c2Vote1 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c2Id },
      { ip: ipA, token: uA.accessToken },
    );
    expect(c2Vote1.status).toBe(200);
    expect(c2Vote1.body?.data).toEqual({ action: 'created' });

    const c2Vote2 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c2Id },
      { ip: ipA, token: uA.accessToken },
    );
    expect(c2Vote2.status).toBe(200);
    expect(c2Vote2.body?.data).toEqual({ action: 'deleted' });

    const c3Vote1 = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: c3Id },
      { ip: ipA, token: uA.accessToken },
    );
    expect(c3Vote1.status).toBe(200);
    expect(c3Vote1.body?.data).toEqual({ action: 'created' });

    const c3Vote2 = await baseClient.post(
      '/api/votes',
      { type: 'DOWNVOTE', commentId: c3Id },
      { ip: ipA, token: uA.accessToken },
    );
    expect(c3Vote2.status).toBe(200);
    expect(c3Vote2.body?.data).toEqual({ action: 'updated' });

    // Verify final thread counts & nested tree counts
    const detailRes = await baseClient.get(`/api/threads/${threadId}`, { ip: ipA });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?._count).toEqual({ comments: 3, votes: 1 });

    const commentsRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
      ip: ipA,
    });
    expect(commentsRes.status).toBe(200);
    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(1);
    const node1 = tree[0]!;
    expect(node1.id).toBe(c1Id);
    expect(node1._count).toEqual({ votes: 1 });
    expect(node1.replies).toHaveLength(1);

    const node2 = node1.replies[0]!;
    expect(node2.id).toBe(c2Id);
    expect(node2.parentId).toBe(c1Id);
    expect(node2._count).toEqual({ votes: 0 });
    expect(node2.replies).toHaveLength(1);

    const node3 = node2.replies[0]!;
    expect(node3.id).toBe(c3Id);
    expect(node3.parentId).toBe(c2Id);
    expect(node3._count).toEqual({ votes: 1 });
    expect(node3.replies).toEqual([]);
  });

  it('T4-S5: Session Lifecycle, Token Isolation & Account Termination', async () => {
    const ip1 = ipForGroup(6, 5, 1);
    const ip2 = ipForGroup(6, 5, 2);

    const { payload, user } = await registerUser(baseClient, tracker, {}, ip1);
    const s1 = await loginUser(
      baseClient,
      tracker,
      payload.email,
      payload.password,
      ip1,
    );

    await Bun.sleep(1100);

    const s2 = await loginUser(
      baseClient,
      tracker,
      payload.username,
      payload.password,
      ip2,
    );
    expect(s1.refreshToken).not.toBe(s2.refreshToken);

    const s1RefreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: s1.refreshToken },
      { ip: ip1 },
    );
    expect(s1RefreshRes.status).toBe(200);
    const s1Access = s1RefreshRes.body.data.accessToken as string;

    // Logout session 1
    const logoutRes = await baseClient.del(
      '/api/authentications',
      { refreshToken: s1.refreshToken },
      { ip: ip1 },
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({
      status: 'success',
      message: 'Refresh token berhasil dihapus (Logout berhasil)',
    });

    const s1RevokedRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: s1.refreshToken },
      { ip: ip1 },
    );
    expect(s1RevokedRes.status).toBe(400);
    expect(s1RevokedRes.body).toEqual({
      status: 'error',
      message: 'Refresh token tidak valid',
    });

    // Session 2 refresh remains valid
    const s2RefreshRes = await baseClient.put(
      '/api/authentications',
      { refreshToken: s2.refreshToken },
      { ip: ip2 },
    );
    expect(s2RefreshRes.status).toBe(200);
    const s2Access = s2RefreshRes.body.data.accessToken as string;

    const s2MeRes = await baseClient.get('/api/users/me', {
      ip: ip2,
      token: s2Access,
    });
    expect(s2MeRes.status).toBe(200);
    expect(s2MeRes.body?.data?.id).toBe(user.id);

    // Terminate user account in DB
    await deleteUserById(user.id);

    const sessions = [
      { token: s1Access, ip: ip1 },
      { token: s2Access, ip: ip2 },
    ];
    for (const sess of sessions) {
      const meGhost = await baseClient.get('/api/users/me', {
        ip: sess.ip,
        token: sess.token,
      });
      expect(meGhost.status).toBe(401);
      expect(meGhost.body).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });

      const threadGhost = await baseClient.post(
        '/api/threads',
        {
          title: 'Ghost Thread Check',
          content: 'Valid content for ghost user check.',
          subforumSlug: 'informatika',
        },
        { ip: sess.ip, token: sess.token },
      );
      expect(threadGhost.status).toBe(401);
      expect(threadGhost.body).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });

      const commentGhost = await baseClient.post(
        '/api/comments',
        {
          content: 'Ghost comment check',
          threadId: crypto.randomUUID(),
        },
        { ip: sess.ip, token: sess.token },
      );
      expect(commentGhost.status).toBe(401);
      expect(commentGhost.body).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });

      const voteGhost = await baseClient.post(
        '/api/votes',
        {
          type: 'UPVOTE',
          threadId: crypto.randomUUID(),
        },
        { ip: sess.ip, token: sess.token },
      );
      expect(voteGhost.status).toBe(401);
      expect(voteGhost.body).toEqual({
        status: 'error',
        message: 'User sudah tidak terdaftar atau akun telah dihapus',
      });
    }
  });

  it('T4-S6: Security, Rate-Limit Abuse & Error Resilience', async () => {
    const attackerIp = '10.251.41.1';
    const legitIp = ipForGroup(6, 6, 1);

    // 1. Invalid .com email (authLimiter slot 1/10)
    const invalidEmailRes = await baseClient.post(
      '/api/users',
      buildUserPayload({ email: `${uniqueId('atk')}@gmail.com` }),
      { ip: attackerIp },
    );
    expect(invalidEmailRes.status).toBe(400);
    expect(invalidEmailRes.body).toEqual({
      status: 'error',
      message: 'Email harus menggunakan domain universitas (.ac.id)',
    });

    // 2. Malformed JSON to POST /api/threads (consistent with T2-F2-04)
    const malformedRes = await baseClient.post('/api/threads', undefined, {
      ip: attackerIp,
      rawBody: '{bad-json',
    });
    expect([400, 500]).toContain(malformedRes.status);
    expect(malformedRes.body?.status).toBe('error');
    expect(typeof malformedRes.body?.message).toBe('string');
    expect(malformedRes.body.message.length).toBeGreaterThan(0);

    // 3. Invalid UUID
    const invalidUuidRes = await baseClient.get('/api/threads/not-a-uuid', {
      ip: attackerIp,
    });
    expect(invalidUuidRes.status).toBe(400);
    expect(invalidUuidRes.body).toEqual({
      status: 'error',
      message: 'ID tidak valid (harus UUID)',
    });

    // 4. Invalid route with query params
    const notFoundRes = await baseClient.get(
      '/api/nonexistent-attack?probe=1&admin=true',
      { ip: attackerIp },
    );
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body).toEqual({
      status: 'error',
      message: 'Rute /api/nonexistent-attack?probe=1&admin=true tidak ditemukan',
    });

    // 5. Brute-force remaining 9 authLimiter slots, then 11th -> 429
    for (let i = 0; i < 9; i += 1) {
      const failAuth = await baseClient.post(
        '/api/authentications',
        { identifier: 'attacker_probe', password: 'WrongPassword123!' },
        { ip: attackerIp },
      );
      expect(failAuth.status).toBe(401);
      expect(failAuth.body).toEqual({
        status: 'error',
        message: 'Kredensial tidak valid',
      });
    }

    const throttledRes = await baseClient.post(
      '/api/authentications',
      { identifier: 'attacker_probe', password: 'WrongPassword123!' },
      { ip: attackerIp },
    );
    expect(throttledRes.status).toBe(429);
    expect(throttledRes.body).toEqual({
      status: 'fail',
      message: 'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
    });
    expect(throttledRes.headers.get('ratelimit')).toBeTruthy();
    expect(throttledRes.headers.get('ratelimit-policy')).toBeTruthy();

    // Non-auth route on attackerIp remains governed by globalLimiter
    const postThrottleUuid = await baseClient.get('/api/threads/not-a-uuid', {
      ip: attackerIp,
    });
    expect(postThrottleUuid.status).toBe(400);

    // 6. Legitimate student unaffected
    const student = await registerAndLogin(baseClient, tracker, {}, legitIp);
    const legitThreadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Diskusi Aman ${uniqueId('legit').slice(-6)}`,
        content: 'Server tetap responsif meski ada IP lain terkena rate limit.',
        subforumSlug: 'informatika',
      },
      { ip: legitIp, token: student.accessToken },
    );
    expect(legitThreadRes.status).toBe(201);
    tracker.threadIds.push(legitThreadRes.body.data.id as string);

    const healthRes = await baseClient.get('/api/health', { ip: legitIp });
    expect(healthRes.status).toBe(200);
    expect(healthRes.body?.status).toBe('success');
    expect(healthRes.body?.message).toBe('Sistem berjalan normal');
    expect(healthRes.body?.data?.database).toBe('connected');
  });

  it('T4-S7: Lost and Found Campus Flow', async () => {
    const ipOwner = ipForGroup(6, 7, 1);
    const ipFinder = ipForGroup(6, 7, 2);

    const owner = await registerAndLogin(baseClient, tracker, {}, ipOwner);
    const finder = await registerAndLogin(baseClient, tracker, {}, ipFinder);

    const imageUrl = 'https://example.uin-suka.ac.id/images/ktm-hilang.jpg';
    const threadRes = await baseClient.post(
      '/api/threads',
      {
        title: `Kehilangan KTM ${uniqueId('lf').slice(-6)}`,
        content: 'Terjatuh di parkiran Gedung SAINTEK sekitar pukul 10.00 WIB.',
        subforumSlug: 'lost-and-found',
        imageUrl,
      },
      { ip: ipOwner, token: owner.accessToken },
    );
    expect(threadRes.status).toBe(201);
    const thread = threadRes.body.data as ThreadItem;
    tracker.threadIds.push(thread.id);
    expect(thread.imageUrl).toBe(imageUrl);
    expect(thread.subforum).toEqual({
      name: 'Lost and Found',
      slug: 'lost-and-found',
    });
    expect(thread.isAnonymous).toBe(false);
    expect(thread.authorId).toBe(owner.user.id);

    const feedRes = await baseClient.get('/api/threads', {
      ip: ipFinder,
      query: { subforum: 'lost-and-found' },
    });
    expect(feedRes.status).toBe(200);
    const foundThread = (feedRes.body.data as ThreadItem[]).find(
      (t: ThreadItem) => t.id === thread.id,
    );
    expect(foundThread).toBeDefined();
    expect(foundThread?.imageUrl).toBe(imageUrl);

    const finderCommentRes = await baseClient.post(
      '/api/comments',
      {
        content: 'KTM sudah saya titipkan di pos satpam utara.',
        threadId: thread.id,
      },
      { ip: ipFinder, token: finder.accessToken },
    );
    expect(finderCommentRes.status).toBe(201);
    const finderCommentId = finderCommentRes.body.data.id as string;
    tracker.commentIds.push(finderCommentId);

    const ownerReplyRes = await baseClient.post(
      '/api/comments',
      {
        content: 'Terima kasih banyak kak, saya ambil sekarang!',
        threadId: thread.id,
        parentId: finderCommentId,
      },
      { ip: ipOwner, token: owner.accessToken },
    );
    expect(ownerReplyRes.status).toBe(201);
    const ownerReplyId = ownerReplyRes.body.data.id as string;
    tracker.commentIds.push(ownerReplyId);

    const upvoteRes = await baseClient.post(
      '/api/votes',
      { type: 'UPVOTE', commentId: finderCommentId },
      { ip: ipOwner, token: owner.accessToken },
    );
    expect(upvoteRes.status).toBe(200);
    expect(upvoteRes.body).toEqual({
      status: 'success',
      message: 'Vote berhasil diberikan',
      data: { action: 'created' },
    });

    const commentsRes = await baseClient.get(`/api/comments/thread/${thread.id}`, {
      ip: ipOwner,
    });
    expect(commentsRes.status).toBe(200);
    const tree = commentsRes.body.data as CommentNode[];
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(finderCommentId);
    expect(tree[0]?._count).toEqual({ votes: 1 });
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe(ownerReplyId);

    // Owner soft-deletes thread once recovered
    const delRes = await baseClient.del(`/api/threads/${thread.id}`, undefined, {
      ip: ipOwner,
      token: owner.accessToken,
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({
      status: 'success',
      message: 'Thread berhasil dihapus',
    });
    expect('data' in delRes.body).toBe(false);

    const allFeedAfter = await baseClient.get('/api/threads', { ip: ipFinder });
    expect(allFeedAfter.status).toBe(200);
    expect(
      (allFeedAfter.body.data as ThreadItem[]).some(
        (t: ThreadItem) => t.id === thread.id,
      ),
    ).toBe(false);

    const lfFeedAfter = await baseClient.get('/api/threads', {
      ip: ipFinder,
      query: { subforum: 'lost-and-found' },
    });
    expect(lfFeedAfter.status).toBe(200);
    expect(
      (lfFeedAfter.body.data as ThreadItem[]).some(
        (t: ThreadItem) => t.id === thread.id,
      ),
    ).toBe(false);

    const detailAfter = await baseClient.get(`/api/threads/${thread.id}`, {
      ip: ipFinder,
    });
    expect(detailAfter.status).toBe(404);
    expect(detailAfter.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });

    const postDeleteComment = await baseClient.post(
      '/api/comments',
      { content: 'Sama-sama!', threadId: thread.id },
      { ip: ipFinder, token: finder.accessToken },
    );
    expect(postDeleteComment.status).toBe(404);
    expect(postDeleteComment.body).toEqual({
      status: 'error',
      message: 'Thread tidak ditemukan',
    });
  });
});
