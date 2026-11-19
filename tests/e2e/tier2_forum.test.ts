import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  closeE2EDb,
  cleanupE2EData,
  ensureSeededSubforums,
} from './helpers/db.ts';
import {
  createAdminSession,
  createModeratorSession,
  createTracker,
  ipForGroup,
  registerAndLogin,
  uniqueId,
  type AuthSession,
} from './helpers/fixtures.ts';
import { createHttpClient, type HttpClient } from './helpers/http.ts';
import { ensureE2EServer, type E2EServerHandle } from './helpers/server.ts';

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

function createLazySession(factory: () => Promise<AuthSession>): () => Promise<AuthSession> {
  let cached: Promise<AuthSession> | null = null;
  return () => {
    if (!cached) {
      cached = factory().catch((err) => {
        cached = null;
        throw err;
      });
    }
    return cached;
  };
}

async function createTrackedSubforum(
  token: string,
  ip: string,
  payload: Record<string, unknown>,
) {
  const res = await baseClient.post('/api/subforums', payload, { token, ip });
  if (res.status === 201 && res.body?.data?.id) {
    tracker.subforumIds.push(res.body.data.id as string);
    if (typeof res.body.data.slug === 'string') {
      tracker.subforumSlugs.push(res.body.data.slug);
    }
  }
  return res;
}

async function createTrackedThread(
  token: string,
  ip: string,
  payload: {
    title: string;
    content: string;
    subforumSlug: string;
    isAnonymous?: boolean;
    imageUrl?: string | null;
  },
) {
  const res = await baseClient.post('/api/threads', payload, { token, ip });
  if (res.status === 201 && res.body?.data?.id) {
    tracker.threadIds.push(res.body.data.id as string);
  }
  return res;
}

async function createTrackedComment(
  token: string,
  ip: string,
  payload: {
    content: string;
    threadId: string;
    parentId?: string | null;
  },
) {
  const res = await baseClient.post('/api/comments', payload, { token, ip });
  if (res.status === 201 && res.body?.data?.id) {
    tracker.commentIds.push(res.body.data.id as string);
  }
  return res;
}

function assertNonEmptyErrorMessage(res: { status: number; body: any }) {
  expect(res.status).toBe(400);
  expect(res.body).not.toBeNull();
  expect(res.body?.status).toBe('error');
  expect(typeof res.body?.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
}

describe('Tier 2 — Forum Domain Boundary & Corner Cases (F6–F11)', () => {
  describe('F6: Subforums Boundaries', () => {
    const ip1 = ipForGroup(4, 6, 1);
    const ip2 = ipForGroup(4, 6, 2);
    const ip3 = ipForGroup(4, 6, 3);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getMod1 = createLazySession(() =>
      createModeratorSession(baseClient, tracker, {}, ip1),
    );
    const getAdmin2 = createLazySession(() =>
      createAdminSession(baseClient, tracker, {}, ip2),
    );
    const getAdmin3 = createLazySession(() =>
      createAdminSession(baseClient, tracker, {}, ip3),
    );

    it('T2-F6-01: GET /api/subforums/slug-tidak-ada returns 404 Subforum tidak ditemukan', async () => {
      const res = await baseClient.get('/api/subforums/slug-tidak-ada', {
        ip: ip1,
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Subforum tidak ditemukan',
      });
    });

    it('T2-F6-02: POST /api/subforums enforces 401 without token and 403 for USER and MODERATOR', async () => {
      const payload = {
        name: `E2E Denied ${uniqueId('sf')}`,
        description: 'desc',
      };

      const noAuthRes = await baseClient.post('/api/subforums', payload, {
        ip: ip1,
      });
      expect(noAuthRes.status).toBe(401);
      expect(noAuthRes.body).toEqual({
        status: 'error',
        message: 'Token tidak ditemukan atau format salah',
      });

      const user = await getUser1();
      const userRes = await createTrackedSubforum(
        user.accessToken,
        ip1,
        payload,
      );
      expect(userRes.status).toBe(403);
      expect(userRes.body).toEqual({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
      });

      const mod = await getMod1();
      const modRes = await createTrackedSubforum(mod.accessToken, ip1, payload);
      expect(modRes.status).toBe(403);
      expect(modRes.body).toEqual({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
      });
    });

    it('T2-F6-03: POST /api/subforums validates name boundaries (2/51 -> 400; 3/50 -> 201)', async () => {
      const admin = await getAdmin2();

      const tooShort = await createTrackedSubforum(admin.accessToken, ip2, {
        name: 'Ab',
        description: 'Terlalu pendek',
      });
      assertNonEmptyErrorMessage(tooShort);

      const tooLong = await createTrackedSubforum(admin.accessToken, ip2, {
        name: 'A'.repeat(51),
        description: 'Terlalu panjang',
      });
      assertNonEmptyErrorMessage(tooLong);

      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const baseIdx = Math.floor(Math.random() * chars.length * chars.length);
      let minCreated = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const idx = (baseIdx + attempt * 37) % (chars.length * chars.length);
        const c1 = chars[Math.floor(idx / chars.length)];
        const c2 = chars[idx % chars.length];
        const minRes = await createTrackedSubforum(admin.accessToken, ip2, {
          name: `E${c1}${c2}`,
          description: 'Boundary 3 karakter',
        });
        if (minRes.status === 201) {
          expect(minRes.body?.status).toBe('success');
          expect(minRes.body?.message).toBe('Subforum berhasil dibuat');
          expect(minRes.body?.data?.name).toHaveLength(3);
          minCreated = true;
          break;
        }
        expect(minRes.status).toBe(400);
        expect(minRes.body?.message).toBe('Nama subforum sudah digunakan');
      }
      expect(minCreated).toBe(true);

      const name50 = `E2E50_${uniqueId('sf')}${'x'.repeat(50)}`.slice(0, 50);
      expect(name50).toHaveLength(50);
      const maxRes = await createTrackedSubforum(admin.accessToken, ip2, {
        name: name50,
        description: 'Boundary 50 karakter',
      });
      expect(maxRes.status).toBe(201);
      expect(maxRes.body?.status).toBe('success');
      expect(maxRes.body?.message).toBe('Subforum berhasil dibuat');
      expect(maxRes.body?.data?.name).toBe(name50);
    });

    it('T2-F6-04: POST /api/subforums rejects description: null (400) while omitting description succeeds (201, null)', async () => {
      const admin = await getAdmin2();

      const nullDescRes = await createTrackedSubforum(admin.accessToken, ip2, {
        name: `E2E Null Desc ${uniqueId('sf')}`,
        description: null,
      });
      assertNonEmptyErrorMessage(nullDescRes);

      const omitName = `E2E No Desc ${uniqueId('sf')}`;
      const omitDescRes = await createTrackedSubforum(admin.accessToken, ip2, {
        name: omitName,
      });
      expect(omitDescRes.status).toBe(201);
      expect(omitDescRes.body?.status).toBe('success');
      expect(omitDescRes.body?.message).toBe('Subforum berhasil dibuat');
      expect(omitDescRes.body?.data?.name).toBe(omitName);
      expect(omitDescRes.body?.data?.description).toBeNull();
    });

    it('T2-F6-05: POST /api/subforums rejects duplicate name (400) and maps consecutive spaces to dashes in slug', async () => {
      const admin = await getAdmin3();
      const dupName = `E2E Dup ${uniqueId('sf')}`;

      const firstRes = await createTrackedSubforum(admin.accessToken, ip3, {
        name: dupName,
        description: 'Subforum pertama',
      });
      expect(firstRes.status).toBe(201);

      const dupRes = await createTrackedSubforum(admin.accessToken, ip3, {
        name: dupName,
        description: 'Duplikat persis',
      });
      expect(dupRes.status).toBe(400);
      expect(dupRes.body).toEqual({
        status: 'error',
        message: 'Nama subforum sudah digunakan',
      });

      const spacedName = `E2E  Teknik  Kimia ${uniqueId('tk')}`;
      const spacedRes = await createTrackedSubforum(admin.accessToken, ip3, {
        name: spacedName,
        description: 'Uji spasi ganda ke tanda hubung',
      });
      expect(spacedRes.status).toBe(201);
      const slug = spacedRes.body?.data?.slug as string;
      expect(slug).toContain('--');
      expect(slug).toBe(spacedName.toLowerCase().split(' ').join('-'));
    });

    it('T2-F6-06: GET /api/subforums/:slug _count.threads still counts soft-deleted threads (main parity)', async () => {
      const admin = await getAdmin3();
      const sfRes = await createTrackedSubforum(admin.accessToken, ip3, {
        name: `E2E Count Parity ${uniqueId('cnt')}`,
        description: 'Uji parity hitung thread terhapus',
      });
      expect(sfRes.status).toBe(201);
      const slug = sfRes.body.data.slug as string;

      const threadRes = await createTrackedThread(admin.accessToken, ip3, {
        title: `Parity Thread ${uniqueId('cnt')}`,
        content: 'Konten thread untuk pengujian _count.threads.',
        subforumSlug: slug,
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const beforeDel = await baseClient.get(`/api/subforums/${slug}`, {
        ip: ip3,
      });
      expect(beforeDel.status).toBe(200);
      expect(beforeDel.body?.data?._count?.threads).toBe(1);

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip3, token: admin.accessToken },
      );
      expect(delRes.status).toBe(200);

      const afterDel = await baseClient.get(`/api/subforums/${slug}`, {
        ip: ip3,
      });
      expect(afterDel.status).toBe(200);
      expect(afterDel.body?.data?._count?.threads).toBe(1);
    });
  });

  describe('F7: Threads Read & Create Boundaries', () => {
    const ip1 = ipForGroup(4, 7, 1);
    const ip2 = ipForGroup(4, 7, 2);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T2-F7-01: POST /api/threads validates title boundaries (4/101 -> 400; 5/100 -> 201)', async () => {
      const user = await getUser1();
      const validContent = 'Konten valid minimal 10 karakter.';

      const shortRes = await createTrackedThread(user.accessToken, ip1, {
        title: 'abcd',
        content: validContent,
        subforumSlug: 'informatika',
      });
      expect(shortRes.status).toBe(400);
      expect(shortRes.body).toEqual({
        status: 'error',
        message: 'Judul minimal 5 karakter',
      });

      const longRes = await createTrackedThread(user.accessToken, ip1, {
        title: 'a'.repeat(101),
        content: validContent,
        subforumSlug: 'informatika',
      });
      expect(longRes.status).toBe(400);
      expect(longRes.body).toEqual({
        status: 'error',
        message: 'Judul maksimal 100 karakter',
      });

      const minRes = await createTrackedThread(user.accessToken, ip1, {
        title: 'abcde',
        content: validContent,
        subforumSlug: 'informatika',
      });
      expect(minRes.status).toBe(201);
      expect(minRes.body?.data?.title).toBe('abcde');

      const maxTitle = 'a'.repeat(100);
      const maxRes = await createTrackedThread(user.accessToken, ip1, {
        title: maxTitle,
        content: validContent,
        subforumSlug: 'informatika',
      });
      expect(maxRes.status).toBe(201);
      expect(maxRes.body?.data?.title).toBe(maxTitle);
    });

    it('T2-F7-02: POST /api/threads validates content boundaries (9/10001 -> 400; 10/10000 -> 201)', async () => {
      const user = await getUser1();

      const shortRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Content Short ${uniqueId('th')}`,
        content: '123456789',
        subforumSlug: 'informatika',
      });
      expect(shortRes.status).toBe(400);
      expect(shortRes.body).toEqual({
        status: 'error',
        message: 'Konten minimal 10 karakter',
      });

      const longRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Content Long ${uniqueId('th')}`,
        content: 'a'.repeat(10001),
        subforumSlug: 'informatika',
      });
      expect(longRes.status).toBe(400);
      expect(longRes.body).toEqual({
        status: 'error',
        message: 'Konten maksimal 10000 karakter',
      });

      const minRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Content Min ${uniqueId('th')}`,
        content: '1234567890',
        subforumSlug: 'informatika',
      });
      expect(minRes.status).toBe(201);
      expect(minRes.body?.data?.content).toBe('1234567890');

      const maxContent = 'a'.repeat(10000);
      const maxRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Content Max ${uniqueId('th')}`,
        content: maxContent,
        subforumSlug: 'informatika',
      });
      expect(maxRes.status).toBe(201);
      expect(maxRes.body?.data?.content).toHaveLength(10000);
    });

    it('T2-F7-03: POST /api/threads rejects invalid imageUrl (400) and accepts imageUrl: null (201)', async () => {
      const user = await getUser1();

      const badRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Bad Image ${uniqueId('th')}`,
        content: 'Konten valid untuk uji URL gambar.',
        subforumSlug: 'informatika',
        imageUrl: 'not-a-url',
      });
      expect(badRes.status).toBe(400);
      expect(badRes.body).toEqual({
        status: 'error',
        message: 'Format URL gambar tidak valid',
      });

      const nullRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Null Image ${uniqueId('th')}`,
        content: 'Konten valid dengan imageUrl null.',
        subforumSlug: 'informatika',
        imageUrl: null,
      });
      expect(nullRes.status).toBe(201);
      expect(nullRes.body?.data?.imageUrl).toBeNull();
    });

    it('T2-F7-04: POST /api/threads with unknown subforumSlug returns 404 Subforum tidak ditemukan', async () => {
      const user = await getUser2();
      const res = await createTrackedThread(user.accessToken, ip2, {
        title: `Unknown Subforum ${uniqueId('th')}`,
        content: 'Konten thread untuk subforum yang tidak ada.',
        subforumSlug: `slug-tidak-ada-${uniqueId('sf')}`,
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Subforum tidak ditemukan',
      });
    });

    it('T2-F7-05: GET /api/threads/:id returns 400 on invalid UUID and 404 on missing UUID', async () => {
      const invalidRes = await baseClient.get('/api/threads/not-a-uuid', {
        ip: ip2,
      });
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body).toEqual({
        status: 'error',
        message: 'ID tidak valid (harus UUID)',
      });

      const missingRes = await baseClient.get(
        `/api/threads/${crypto.randomUUID()}`,
        { ip: ip2 },
      );
      expect(missingRes.status).toBe(404);
      expect(missingRes.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });

    it('T2-F7-06: GET /api/threads?subforum=slug-tidak-ada falls back to all active threads (200)', async () => {
      const user = await getUser2();
      const createRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Fallback Active ${uniqueId('fb')}`,
        content: 'Thread aktif untuk verifikasi fallback query subforum.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const activeThreadId = createRes.body.data.id as string;

      const listRes = await baseClient.get('/api/threads', {
        ip: ip2,
        query: { subforum: 'slug-tidak-ada' },
      });

      expect(listRes.status).toBe(200);
      expect(listRes.body?.status).toBe('success');
      expect(listRes.body?.message).toBe('Daftar thread berhasil dimuat');
      const items = listRes.body.data as Array<Record<string, unknown>>;
      expect(items.some((t) => t.id === activeThreadId)).toBe(true);
    });
  });

  describe('F8: Thread Soft-Delete Boundaries', () => {
    const ip1 = ipForGroup(4, 8, 1);
    const ip2 = ipForGroup(4, 8, 2);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getOwner2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getMod2 = createLazySession(() =>
      createModeratorSession(baseClient, tracker, {}, ip2),
    );

    it('T2-F8-01: DELETE /api/threads/not-a-uuid returns 400 ID tidak valid (harus UUID)', async () => {
      const user = await getUser1();
      const res = await baseClient.del('/api/threads/not-a-uuid', undefined, {
        ip: ip1,
        token: user.accessToken,
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        status: 'error',
        message: 'ID tidak valid (harus UUID)',
      });
    });

    it('T2-F8-02: DELETE /api/threads/<nonexistent-uuid> returns 404 Thread tidak ditemukan', async () => {
      const user = await getUser1();
      const res = await baseClient.del(
        `/api/threads/${crypto.randomUUID()}`,
        undefined,
        { ip: ip1, token: user.accessToken },
      );

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });

    it('T2-F8-03: Re-deleting an already soft-deleted thread returns 404 Thread tidak ditemukan', async () => {
      const user = await getUser1();
      const createRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Double Del ${uniqueId('del')}`,
        content: 'Thread untuk uji penghapusan dua kali.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const firstDel = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip1, token: user.accessToken },
      );
      expect(firstDel.status).toBe(200);

      const secondDel = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip1, token: user.accessToken },
      );
      expect(secondDel.status).toBe(404);
      expect(secondDel.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });

    it('T2-F8-04: MODERATOR deleting another user thread returns 403 (main parity)', async () => {
      const owner = await getOwner2();
      const mod = await getMod2();
      const createRes = await createTrackedThread(owner.accessToken, ip2, {
        title: `Mod Forbidden ${uniqueId('del')}`,
        content: 'Thread tidak boleh dihapus oleh moderator.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip2, token: mod.accessToken },
      );
      expect(delRes.status).toBe(403);
      expect(delRes.body).toEqual({
        status: 'error',
        message: 'Anda tidak berhak menghapus thread ini',
      });
    });

    it('T2-F8-05: POST /api/comments targeting a soft-deleted thread returns 404 Thread tidak ditemukan', async () => {
      const owner = await getOwner2();
      const createRes = await createTrackedThread(owner.accessToken, ip2, {
        title: `Comment On Deleted ${uniqueId('del')}`,
        content: 'Thread yang dihapus sebelum dikomentari.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip2, token: owner.accessToken },
      );
      expect(delRes.status).toBe(200);

      const commentRes = await createTrackedComment(owner.accessToken, ip2, {
        content: 'Komentar pada thread terhapus',
        threadId,
      });
      expect(commentRes.status).toBe(404);
      expect(commentRes.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });
  });

  describe('F9: Saintekfess Anonymity Boundaries', () => {
    const ip1 = ipForGroup(4, 9, 1);
    const ip2 = ipForGroup(4, 9, 2);
    const getAuthor1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, { prodi: 'Sains Data' }, ip1),
    );
    const getAdmin1 = createLazySession(() =>
      createAdminSession(baseClient, tracker, {}, ip1),
    );
    const getAuthor2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getCommenter2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T2-F9-01: GET /api/threads/:id masks author while preserving author.prodi for author and ADMIN callers', async () => {
      const author = await getAuthor1();
      const admin = await getAdmin1();
      const createRes = await createTrackedThread(author.accessToken, ip1, {
        title: `Anon Prodi Parity ${uniqueId('anon')}`,
        content: 'Thread anonim untuk uji prodi parity pada detail.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      for (const token of [author.accessToken, admin.accessToken]) {
        const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
          ip: ip1,
          token,
        });
        expect(detailRes.status).toBe(200);
        expect(detailRes.body?.message).toBe('Detail thread berhasil dimuat');
        expect(detailRes.body?.data?.authorId).toBeNull();
        expect(detailRes.body?.data?.author).toEqual({
          id: null,
          username: 'Saintekfess User',
          fullName: 'Anonymous',
          prodi: author.user.prodi,
        });
      }
    });

    it('T2-F9-02: Original USER author attempting DELETE /api/threads/:id on own anonymous thread gets 403', async () => {
      const author = await getAuthor1();
      const createRes = await createTrackedThread(author.accessToken, ip1, {
        title: `Anon Author Delete ${uniqueId('anon')}`,
        content: 'Thread anonim tidak dapat dihapus oleh pembuat USER.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip1, token: author.accessToken },
      );
      expect(delRes.status).toBe(403);
      expect(delRes.body).toEqual({
        status: 'error',
        message: 'Anda tidak berhak menghapus thread ini',
      });
    });

    it('T2-F9-03: ADMIN can DELETE /api/threads/:id on an anonymous thread (200)', async () => {
      const author = await getAuthor1();
      const admin = await getAdmin1();
      const createRes = await createTrackedThread(author.accessToken, ip1, {
        title: `Anon Admin Delete ${uniqueId('anon')}`,
        content: 'Thread anonim dapat dihapus oleh ADMIN.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip1, token: admin.accessToken },
      );
      expect(delRes.status).toBe(200);
      expect(delRes.body).toEqual({
        status: 'success',
        message: 'Thread berhasil dihapus',
      });
      expect('data' in delRes.body).toBe(false);

      const afterRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip1,
      });
      expect(afterRes.status).toBe(404);
    });

    it('T2-F9-04: Non-anonymous thread in saintekfess (isAnonymous: false) does NOT mask thread or comment authors', async () => {
      const author = await getAuthor2();
      const commenter = await getCommenter2();

      const threadRes = await createTrackedThread(author.accessToken, ip2, {
        title: `Public Saintekfess ${uniqueId('pub')}`,
        content: 'Thread publik non-anonim di subforum saintekfess.',
        subforumSlug: 'saintekfess',
        isAnonymous: false,
      });
      expect(threadRes.status).toBe(201);
      expect(threadRes.body?.data?.isAnonymous).toBe(false);
      expect(threadRes.body?.data?.authorId).toBe(author.user.id);
      expect(threadRes.body?.data?.author).toEqual({
        username: author.user.username,
        fullName: author.user.fullName,
      });
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(
        commenter.accessToken,
        ip2,
        {
          content: 'Komentar non-anonim di saintekfess',
          threadId,
        },
      );
      expect(commentRes.status).toBe(201);
      expect(commentRes.body?.data?.authorId).toBe(commenter.user.id);
      expect(commentRes.body?.data?.author).toEqual({
        username: commenter.user.username,
        fullName: commenter.user.fullName,
      });

      const listRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
        ip: ip2,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body?.data?.[0]?.authorId).toBe(commenter.user.id);
      expect(listRes.body?.data?.[0]?.author).toEqual({
        username: commenter.user.username,
        fullName: commenter.user.fullName,
      });
    });

    it('T2-F9-05: Anonymous thread in non-saintekfess subforum (informatika) still masks thread and comment authors', async () => {
      const author = await getAuthor2();
      const commenter = await getCommenter2();

      const threadRes = await createTrackedThread(author.accessToken, ip2, {
        title: `Anon Informatika ${uniqueId('anon')}`,
        content: 'Thread anonim di luar subforum saintekfess.',
        subforumSlug: 'informatika',
        isAnonymous: true,
      });
      expect(threadRes.status).toBe(201);
      expect(threadRes.body?.data?.authorId).toBeNull();
      expect(threadRes.body?.data?.author).toEqual({
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(
        commenter.accessToken,
        ip2,
        {
          content: 'Komentar pada thread anonim di informatika',
          threadId,
        },
      );
      expect(commentRes.status).toBe(201);
      expect(commentRes.body?.data?.authorId).toBeNull();
      expect(commentRes.body?.data?.author).toEqual({
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });

      const listRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
        ip: ip2,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body?.data?.[0]?.authorId).toBeNull();
      expect(listRes.body?.data?.[0]?.author).toEqual({
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
    });
  });

  describe('F10: Comments & Replies Boundaries', () => {
    const ip1 = ipForGroup(4, 10, 1);
    const ip2 = ipForGroup(4, 10, 2);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T2-F10-01: POST /api/comments validates content boundaries (0/2001 -> 400; 1/2000 -> 201)', async () => {
      const user = await getUser1();
      const threadRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Comment Bounds ${uniqueId('cb')}`,
        content: 'Thread untuk uji batas panjang komentar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const emptyRes = await createTrackedComment(user.accessToken, ip1, {
        content: '',
        threadId,
      });
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body).toEqual({
        status: 'error',
        message: 'Komentar tidak boleh kosong',
      });

      const overRes = await createTrackedComment(user.accessToken, ip1, {
        content: 'a'.repeat(2001),
        threadId,
      });
      expect(overRes.status).toBe(400);
      expect(overRes.body).toEqual({
        status: 'error',
        message: 'Komentar maksimal 2000 karakter',
      });

      const minRes = await createTrackedComment(user.accessToken, ip1, {
        content: 'x',
        threadId,
      });
      expect(minRes.status).toBe(201);
      expect(minRes.body?.data?.content).toBe('x');

      const maxContent = 'a'.repeat(2000);
      const maxRes = await createTrackedComment(user.accessToken, ip1, {
        content: maxContent,
        threadId,
      });
      expect(maxRes.status).toBe(201);
      expect(maxRes.body?.data?.content).toHaveLength(2000);
    });

    it('T2-F10-02: POST /api/comments validates threadId and parentId UUIDs', async () => {
      const user = await getUser1();
      const threadRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Comment UUIDs ${uniqueId('cu')}`,
        content: 'Thread untuk uji validasi UUID komentar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const validThreadId = threadRes.body.data.id as string;

      const badThreadRes = await createTrackedComment(user.accessToken, ip1, {
        content: 'Hi',
        threadId: 'not-a-uuid',
      });
      expect(badThreadRes.status).toBe(400);
      expect(badThreadRes.body).toEqual({
        status: 'error',
        message: 'ID Thread tidak valid',
      });

      const badParentRes = await createTrackedComment(user.accessToken, ip1, {
        content: 'Hi',
        threadId: validThreadId,
        parentId: 'not-a-uuid',
      });
      expect(badParentRes.status).toBe(400);
      expect(badParentRes.body).toEqual({
        status: 'error',
        message: 'ID Parent tidak valid',
      });
    });

    it('T2-F10-03: POST /api/comments with non-existent threadId UUID returns 404 Thread tidak ditemukan', async () => {
      const user = await getUser2();
      const res = await createTrackedComment(user.accessToken, ip2, {
        content: 'Orphan comment',
        threadId: crypto.randomUUID(),
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });

    it('T2-F10-04: POST /api/comments with non-existent parentId UUID returns 404 Komentar induk tidak ditemukan', async () => {
      const user = await getUser2();
      const threadRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Missing Parent ${uniqueId('mp')}`,
        content: 'Thread untuk uji parentId tidak ditemukan.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const validThreadId = threadRes.body.data.id as string;

      const res = await createTrackedComment(user.accessToken, ip2, {
        content: 'Missing parent reply',
        threadId: validThreadId,
        parentId: crypto.randomUUID(),
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Komentar induk tidak ditemukan',
      });
    });

    it('T2-F10-05: GET /api/comments/thread/:threadId returns 400 on invalid UUID and 200 [] on missing thread UUID', async () => {
      const invalidRes = await baseClient.get(
        '/api/comments/thread/not-a-uuid',
        { ip: ip2 },
      );
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body).toEqual({
        status: 'error',
        message: 'ID tidak valid (harus UUID)',
      });

      const missingRes = await baseClient.get(
        `/api/comments/thread/${crypto.randomUUID()}`,
        { ip: ip2 },
      );
      expect(missingRes.status).toBe(200);
      expect(missingRes.body).toEqual({
        status: 'success',
        message: 'Daftar komentar berhasil dimuat',
        data: [],
      });
    });
  });

  describe('F11: Votes Boundaries', () => {
    const ip1 = ipForGroup(4, 11, 1);
    const ip2 = ipForGroup(4, 11, 2);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T2-F11-01: POST /api/votes with both threadId and commentId returns 400 XOR error', async () => {
      const user = await getUser1();
      const res = await baseClient.post(
        '/api/votes',
        {
          type: 'UPVOTE',
          threadId: crypto.randomUUID(),
          commentId: crypto.randomUUID(),
        },
        { ip: ip1, token: user.accessToken },
      );

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Harus memilih salah satu saja, antara threadId atau commentId',
      });
    });

    it('T2-F11-02: POST /api/votes with neither threadId nor commentId (or both null) returns 400 XOR error', async () => {
      const user = await getUser1();

      const omittedRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE' },
        { ip: ip1, token: user.accessToken },
      );
      expect(omittedRes.status).toBe(400);
      expect(omittedRes.body).toEqual({
        status: 'error',
        message: 'Harus memilih salah satu saja, antara threadId atau commentId',
      });

      const nullBothRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId: null, commentId: null },
        { ip: ip1, token: user.accessToken },
      );
      expect(nullBothRes.status).toBe(400);
      expect(nullBothRes.body).toEqual({
        status: 'error',
        message: 'Harus memilih salah satu saja, antara threadId atau commentId',
      });
    });

    it('T2-F11-03: POST /api/votes with invalid type LIKE returns 400 error envelope', async () => {
      const user = await getUser1();
      const res = await baseClient.post(
        '/api/votes',
        { type: 'LIKE', threadId: crypto.randomUUID() },
        { ip: ip1, token: user.accessToken },
      );

      assertNonEmptyErrorMessage(res);
    });

    it('T2-F11-04: POST /api/votes with invalid UUID in threadId or commentId returns 400 error envelope', async () => {
      const user = await getUser2();

      const badThreadRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId: 'not-a-uuid' },
        { ip: ip2, token: user.accessToken },
      );
      assertNonEmptyErrorMessage(badThreadRes);

      const badCommentRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', commentId: 'not-a-uuid' },
        { ip: ip2, token: user.accessToken },
      );
      assertNonEmptyErrorMessage(badCommentRes);
    });

    it('T2-F11-05: POST /api/votes with non-existent threadId UUID returns 500 (main FK parity)', async () => {
      const user = await getUser2();
      const res = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId: crypto.randomUUID() },
        { ip: ip2, token: user.accessToken },
      );

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      });
    });
  });
});
