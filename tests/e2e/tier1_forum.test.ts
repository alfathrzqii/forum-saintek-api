import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  closeE2EDb,
  cleanupE2EData,
  ensureSeededSubforums,
} from './helpers/db.ts';
import {
  createAdminSession,
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
  payload: { name: string; description?: string },
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

describe('Tier 1 — Forum Domain (F6–F11)', () => {
  describe('F6: Subforums (/api/subforums)', () => {
    const readIp = ipForGroup(3, 6, 1);
    const adminIp = ipForGroup(3, 6, 2);
    const getAdmin = createLazySession(() =>
      createAdminSession(baseClient, tracker, {}, adminIp),
    );

    it('T1-F6-01: GET /api/subforums returns 200 with 7 seeded subforums sorted alphabetically with thread counts', async () => {
      const res = await baseClient.get('/api/subforums', { ip: readIp });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Daftar subforum berhasil dimuat');
      expect(Array.isArray(res.body?.data)).toBe(true);

      const items = res.body.data as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(7);

      for (const item of items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.name).toBe('string');
        expect(typeof item.slug).toBe('string');
        expect(
          item.description === null || typeof item.description === 'string',
        ).toBe(true);
        const count = item._count as Record<string, unknown> | undefined;
        expect(typeof count?.threads).toBe('number');
        expect((count?.threads as number) >= 0).toBe(true);
      }

      const expectedSeededSlugs = [
        'bioteknologi',
        'ilmu-lingkungan',
        'informatika',
        'lost-and-found',
        'sains-data',
        'saintekfess',
        'teknologi-pangan',
      ];
      const returnedSlugs = items.map((s) => s.slug as string);
      let prevIdx = -1;
      for (const slug of expectedSeededSlugs) {
        const idx = returnedSlugs.indexOf(slug);
        expect(idx).toBeGreaterThan(prevIdx);
        prevIdx = idx;
      }
    });

    it('T1-F6-02: GET /api/subforums/informatika returns 200 detail with expected fields and _count.threads', async () => {
      const res = await baseClient.get('/api/subforums/informatika', {
        ip: readIp,
      });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Detail subforum berhasil dimuat');
      expect(typeof res.body?.data?.id).toBe('string');
      expect(res.body?.data?.name).toBe('Informatika');
      expect(res.body?.data?.slug).toBe('informatika');
      expect(res.body?.data?.description).toBe(
        'Coding, networking, dan kawan-kawan.',
      );
      expect(typeof res.body?.data?._count?.threads).toBe('number');
      expect(res.body.data._count.threads).toBeGreaterThanOrEqual(0);
    });

    it('T1-F6-03: GET /api/subforums/saintekfess returns 200 with exact seeded name and slug', async () => {
      const res = await baseClient.get('/api/subforums/saintekfess', {
        ip: readIp,
      });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Detail subforum berhasil dimuat');
      expect(typeof res.body?.data?.id).toBe('string');
      expect(res.body?.data?.name).toBe('Saintekfess');
      expect(res.body?.data?.slug).toBe('saintekfess');
      expect(res.body?.data?.description).toBe(
        'Curhatan anonim warga Saintek.',
      );
      expect(typeof res.body?.data?._count?.threads).toBe('number');
    });

    it('T1-F6-04: POST /api/subforums as ADMIN returns 201 with generated slug and no _count field', async () => {
      const admin = await getAdmin();
      const name = `E2E Teknik Elektro ${uniqueId('sf')}`;
      const description = 'Diskusi teknik elektro';

      const res = await createTrackedSubforum(admin.accessToken, adminIp, {
        name,
        description,
      });

      expect(res.status).toBe(201);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Subforum berhasil dibuat');

      const data = res.body?.data as Record<string, unknown>;
      expect(typeof data.id).toBe('string');
      expect(data.name).toBe(name);
      expect(data.slug).toBe(name.toLowerCase().split(' ').join('-'));
      expect(data.description).toBe(description);
      expect('_count' in data).toBe(false);
    });

    it('T1-F6-05: Newly created subforum appears in GET /api/subforums and GET /api/subforums/:slug', async () => {
      const admin = await getAdmin();
      const name = `E2E Fisika ${uniqueId('sf')}`;
      const description = 'Diskusi fisika komputasi';

      const createRes = await createTrackedSubforum(admin.accessToken, adminIp, {
        name,
        description,
      });
      expect(createRes.status).toBe(201);
      const created = createRes.body.data as {
        id: string;
        name: string;
        slug: string;
        description: string;
      };

      const listRes = await baseClient.get('/api/subforums', { ip: adminIp });
      expect(listRes.status).toBe(200);
      expect(listRes.body?.message).toBe('Daftar subforum berhasil dimuat');
      const list = listRes.body.data as Array<Record<string, unknown>>;
      const matched = list.find((s) => s.id === created.id);
      expect(matched).toBeDefined();
      expect(matched?.name).toBe(created.name);
      expect(matched?.slug).toBe(created.slug);

      const detailRes = await baseClient.get(`/api/subforums/${created.slug}`, {
        ip: adminIp,
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toEqual({
        status: 'success',
        message: 'Detail subforum berhasil dimuat',
        data: {
          id: created.id,
          name: created.name,
          slug: created.slug,
          description: created.description,
          _count: { threads: 0 },
        },
      });
    });
  });

  describe('F7: Threads Read & Create (/api/threads)', () => {
    const ip1 = ipForGroup(3, 7, 1);
    const ip2 = ipForGroup(3, 7, 2);
    const getUser1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T1-F7-01: POST /api/threads returns 201 with expected author, subforum, and _count shape', async () => {
      const user = await getUser1();
      const title = `E2E Thread Title ${uniqueId('th')}`;
      const content = 'Konten thread informatika yang valid.';

      const res = await createTrackedThread(user.accessToken, ip1, {
        title,
        content,
        subforumSlug: 'informatika',
      });

      expect(res.status).toBe(201);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Thread berhasil dipublikasikan');

      const data = res.body.data as Record<string, unknown>;
      expect(typeof data.id).toBe('string');
      expect(data.title).toBe(title);
      expect(data.content).toBe(content);
      expect(data.imageUrl).toBeNull();
      expect(data.isAnonymous).toBe(false);
      expect(data.authorId).toBe(user.user.id);
      expect(typeof data.createdAt).toBe('string');
      expect(Number.isNaN(Date.parse(data.createdAt as string))).toBe(false);

      const author = data.author as Record<string, unknown>;
      expect(author).toEqual({
        username: user.user.username,
        fullName: user.user.fullName,
      });
      expect('id' in author).toBe(false);
      expect('prodi' in author).toBe(false);

      expect(data.subforum).toEqual({
        name: 'Informatika',
        slug: 'informatika',
      });
      expect(data._count).toEqual({ comments: 0, votes: 0 });
    });

    it('T1-F7-02: POST /api/threads with valid imageUrl persists imageUrl in creation and detail responses', async () => {
      const user = await getUser1();
      const imageUrl = 'https://example.com/e2e-image.png';

      const createRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Thread Gambar ${uniqueId('img')}`,
        content: 'Konten dengan URL gambar valid.',
        subforumSlug: 'informatika',
        imageUrl,
      });

      expect(createRes.status).toBe(201);
      expect(createRes.body?.data?.imageUrl).toBe(imageUrl);

      const threadId = createRes.body.data.id as string;
      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip1,
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body?.data?.imageUrl).toBe(imageUrl);
    });

    it('T1-F7-03: GET /api/threads returns 200 ordered by createdAt DESC with _count shape', async () => {
      const user = await getUser1();
      const firstRes = await createTrackedThread(user.accessToken, ip1, {
        title: `First Thread ${uniqueId('ord')}`,
        content: 'Konten thread pertama untuk cek urutan.',
        subforumSlug: 'informatika',
      });
      expect(firstRes.status).toBe(201);

      await Bun.sleep(15);

      const secondRes = await createTrackedThread(user.accessToken, ip1, {
        title: `Second Thread ${uniqueId('ord')}`,
        content: 'Konten thread kedua untuk cek urutan.',
        subforumSlug: 'informatika',
      });
      expect(secondRes.status).toBe(201);

      const t1Id = firstRes.body.data.id as string;
      const t2Id = secondRes.body.data.id as string;

      const listRes = await baseClient.get('/api/threads', { ip: ip1 });
      expect(listRes.status).toBe(200);
      expect(listRes.body?.status).toBe('success');
      expect(listRes.body?.message).toBe('Daftar thread berhasil dimuat');
      expect(Array.isArray(listRes.body?.data)).toBe(true);

      const threads = listRes.body.data as Array<Record<string, unknown>>;
      const idx1 = threads.findIndex((t) => t.id === t1Id);
      const idx2 = threads.findIndex((t) => t.id === t2Id);
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeLessThan(idx1);

      const latest = threads[idx2];
      expect(typeof latest.title).toBe('string');
      expect(typeof latest.content).toBe('string');
      expect(typeof latest.isAnonymous).toBe('boolean');
      expect(typeof latest.createdAt).toBe('string');
      const author = latest.author as Record<string, unknown>;
      expect(author).toEqual({
        username: user.user.username,
        fullName: user.user.fullName,
      });
      expect('id' in author).toBe(false);
      expect('prodi' in author).toBe(false);
      expect(latest.subforum).toEqual({
        name: 'Informatika',
        slug: 'informatika',
      });
      const counts = latest._count as Record<string, unknown>;
      expect(typeof counts?.comments).toBe('number');
      expect(typeof counts?.votes).toBe('number');
    });

    it('T1-F7-04: GET /api/threads?subforum=informatika filters threads to informatika only', async () => {
      const user = await getUser2();
      const infoRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Info Thread ${uniqueId('f')}`,
        content: 'Thread khusus subforum informatika.',
        subforumSlug: 'informatika',
      });
      const sdRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Sains Data Thread ${uniqueId('f')}`,
        content: 'Thread khusus subforum sains data.',
        subforumSlug: 'sains-data',
      });
      expect(infoRes.status).toBe(201);
      expect(sdRes.status).toBe(201);

      const infoId = infoRes.body.data.id as string;
      const sdId = sdRes.body.data.id as string;

      const res = await baseClient.get('/api/threads', {
        ip: ip2,
        query: { subforum: 'informatika' },
      });

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Daftar thread berhasil dimuat');
      const items = res.body.data as Array<Record<string, unknown>>;
      for (const item of items) {
        const sf = item.subforum as Record<string, unknown>;
        expect(sf.slug).toBe('informatika');
      }
      expect(items.some((t) => t.id === infoId)).toBe(true);
      expect(items.some((t) => t.id === sdId)).toBe(false);
    });

    it('T1-F7-05: GET /api/threads/:id returns 200 detail including author.id and author.prodi', async () => {
      const user = await getUser2();
      const createRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Detail Thread ${uniqueId('det')}`,
        content: 'Konten detail thread untuk pengujian GET by id.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const res = await baseClient.get(`/api/threads/${threadId}`, { ip: ip2 });
      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Detail thread berhasil dimuat');

      const data = res.body.data as Record<string, unknown>;
      expect(data.id).toBe(threadId);
      expect(data.authorId).toBe(user.user.id);
      expect(data.author).toEqual({
        id: user.user.id,
        username: user.user.username,
        fullName: user.user.fullName,
        prodi: user.user.prodi,
      });
      expect(data.subforum).toEqual({
        name: 'Informatika',
        slug: 'informatika',
      });
      expect(data._count).toEqual({ comments: 0, votes: 0 });
    });

    it('T1-F7-06: Threads created in distinct subforums stay isolated in ?subforum=<slug> queries', async () => {
      const user = await getUser2();
      const bioRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Bio Thread ${uniqueId('iso')}`,
        content: 'Diskusi rekayasa hayati bioteknologi.',
        subforumSlug: 'bioteknologi',
      });
      const sdRes = await createTrackedThread(user.accessToken, ip2, {
        title: `SD Thread ${uniqueId('iso')}`,
        content: 'Diskusi machine learning sains data.',
        subforumSlug: 'sains-data',
      });
      expect(bioRes.status).toBe(201);
      expect(sdRes.status).toBe(201);

      const bioId = bioRes.body.data.id as string;
      const sdId = sdRes.body.data.id as string;

      const bioList = await baseClient.get('/api/threads', {
        ip: ip2,
        query: { subforum: 'bioteknologi' },
      });
      expect(bioList.status).toBe(200);
      const bioItems = bioList.body.data as Array<Record<string, unknown>>;
      expect(bioItems.some((t) => t.id === bioId)).toBe(true);
      expect(bioItems.some((t) => t.id === sdId)).toBe(false);

      const sdList = await baseClient.get('/api/threads', {
        ip: ip2,
        query: { subforum: 'sains-data' },
      });
      expect(sdList.status).toBe(200);
      const sdItems = sdList.body.data as Array<Record<string, unknown>>;
      expect(sdItems.some((t) => t.id === sdId)).toBe(true);
      expect(sdItems.some((t) => t.id === bioId)).toBe(false);
    });
  });

  describe('F8: Thread Soft-Delete & Authorization (DELETE /api/threads/:id)', () => {
    const ip1 = ipForGroup(3, 8, 1);
    const ip2 = ipForGroup(3, 8, 2);
    const getOwner1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getAdmin1 = createLazySession(() =>
      createAdminSession(baseClient, tracker, {}, ip1),
    );
    const getOwner2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getOther2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T1-F8-01: DELETE /api/threads/:id by non-anonymous author returns 200 with no data key', async () => {
      const owner = await getOwner1();
      const createRes = await createTrackedThread(owner.accessToken, ip1, {
        title: `Owner Del ${uniqueId('del')}`,
        content: 'Thread yang akan dihapus oleh pemilik.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip1, token: owner.accessToken },
      );

      expect(delRes.status).toBe(200);
      expect(delRes.body).toEqual({
        status: 'success',
        message: 'Thread berhasil dihapus',
      });
      expect('data' in delRes.body).toBe(false);
    });

    it('T1-F8-02: DELETE /api/threads/:id by ADMIN on another user thread returns 200', async () => {
      const owner = await getOwner1();
      const admin = await getAdmin1();
      const createRes = await createTrackedThread(owner.accessToken, ip1, {
        title: `Admin Del ${uniqueId('del')}`,
        content: 'Thread pengguna yang akan dihapus admin.',
        subforumSlug: 'informatika',
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
    });

    it('T1-F8-03: Soft-deleted thread disappears from GET /api/threads and GET /api/threads?subforum=<slug>', async () => {
      const owner = await getOwner2();
      const createRes = await createTrackedThread(owner.accessToken, ip2, {
        title: `Hidden After Del ${uniqueId('del')}`,
        content: 'Thread akan disembunyikan setelah soft delete.',
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

      const allRes = await baseClient.get('/api/threads', { ip: ip2 });
      expect(allRes.status).toBe(200);
      expect(
        (allRes.body.data as Array<Record<string, unknown>>).some(
          (t) => t.id === threadId,
        ),
      ).toBe(false);

      const filteredRes = await baseClient.get('/api/threads', {
        ip: ip2,
        query: { subforum: 'informatika' },
      });
      expect(filteredRes.status).toBe(200);
      expect(
        (filteredRes.body.data as Array<Record<string, unknown>>).some(
          (t) => t.id === threadId,
        ),
      ).toBe(false);
    });

    it('T1-F8-04: GET /api/threads/:id on soft-deleted thread returns 404', async () => {
      const owner = await getOwner2();
      const createRes = await createTrackedThread(owner.accessToken, ip2, {
        title: `Detail 404 Del ${uniqueId('del')}`,
        content: 'Thread untuk verifikasi 404 detail setelah hapus.',
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

      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip2,
      });
      expect(detailRes.status).toBe(404);
      expect(detailRes.body).toEqual({
        status: 'error',
        message: 'Thread tidak ditemukan',
      });
    });

    it('T1-F8-05: DELETE /api/threads/:id by a different USER returns 403 and keeps thread active', async () => {
      const owner = await getOwner2();
      const other = await getOther2();
      const createRes = await createTrackedThread(owner.accessToken, ip2, {
        title: `Forbidden Del ${uniqueId('del')}`,
        content: 'Thread tidak boleh dihapus oleh user lain.',
        subforumSlug: 'informatika',
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const delRes = await baseClient.del(
        `/api/threads/${threadId}`,
        undefined,
        { ip: ip2, token: other.accessToken },
      );
      expect(delRes.status).toBe(403);
      expect(delRes.body).toEqual({
        status: 'error',
        message: 'Anda tidak berhak menghapus thread ini',
      });

      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip2,
      });
      expect(detailRes.status).toBe(200);
    });
  });

  describe('F9: Saintekfess Anonymity Masking', () => {
    const ip1 = ipForGroup(3, 9, 1);
    const ip2 = ipForGroup(3, 9, 2);
    const getAuthor1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getViewer1 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getAuthor2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getCommenter2 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T1-F9-01: POST /api/threads with isAnonymous: true returns 201 with masked author', async () => {
      const author = await getAuthor1();
      const res = await createTrackedThread(author.accessToken, ip1, {
        title: `Curhat Anon ${uniqueId('anon')}`,
        content: 'Isi curhatan anonim saintekfess.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });

      expect(res.status).toBe(201);
      expect(res.body?.status).toBe('success');
      expect(res.body?.message).toBe('Thread berhasil dipublikasikan');
      expect(res.body?.data?.isAnonymous).toBe(true);
      expect(res.body?.data?.authorId).toBeNull();
      expect(res.body?.data?.author).toEqual({
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      expect('prodi' in (res.body.data.author as Record<string, unknown>)).toBe(
        false,
      );
    });

    it('T1-F9-02: GET /api/threads masks anonymous thread for unauthenticated, viewer, and author callers', async () => {
      const author = await getAuthor1();
      const viewer = await getViewer1();
      const createRes = await createTrackedThread(author.accessToken, ip1, {
        title: `Curhat List Anon ${uniqueId('anon')}`,
        content: 'Isi curhatan anonim untuk list thread.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      const callerTokens: Array<string | undefined> = [
        undefined,
        viewer.accessToken,
        author.accessToken,
      ];

      for (const token of callerTokens) {
        const filteredRes = await baseClient.get('/api/threads', {
          ip: ip1,
          query: { subforum: 'saintekfess' },
          ...(token ? { token } : {}),
        });
        expect(filteredRes.status).toBe(200);
        const filteredItem = (
          filteredRes.body.data as Array<Record<string, unknown>>
        ).find((t) => t.id === threadId);
        expect(filteredItem).toBeDefined();
        expect(filteredItem?.authorId).toBeNull();
        expect(filteredItem?.author).toEqual({
          id: null,
          username: 'Saintekfess User',
          fullName: 'Anonymous',
        });

        const allRes = await baseClient.get('/api/threads', {
          ip: ip1,
          ...(token ? { token } : {}),
        });
        expect(allRes.status).toBe(200);
        const allItem = (
          allRes.body.data as Array<Record<string, unknown>>
        ).find((t) => t.id === threadId);
        expect(allItem).toBeDefined();
        expect(allItem?.authorId).toBeNull();
        expect(allItem?.author).toEqual({
          id: null,
          username: 'Saintekfess User',
          fullName: 'Anonymous',
        });
      }
    });

    it('T1-F9-03: GET /api/threads/:id masks author identity on anonymous thread', async () => {
      const author = await getAuthor1();
      const createRes = await createTrackedThread(author.accessToken, ip1, {
        title: `Curhat Detail Anon ${uniqueId('anon')}`,
        content: 'Isi curhatan anonim untuk detail thread.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(createRes.status).toBe(201);
      const threadId = createRes.body.data.id as string;

      for (const token of [undefined, author.accessToken]) {
        const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
          ip: ip1,
          ...(token ? { token } : {}),
        });
        expect(detailRes.status).toBe(200);
        expect(detailRes.body?.message).toBe('Detail thread berhasil dimuat');
        expect(detailRes.body?.data?.authorId).toBeNull();
        expect(detailRes.body?.data?.author?.id).toBeNull();
        expect(detailRes.body?.data?.author?.username).toBe('Saintekfess User');
        expect(detailRes.body?.data?.author?.fullName).toBe('Anonymous');
      }
    });

    it('T1-F9-04: POST /api/comments on anonymous thread returns 201 with masked comment author', async () => {
      const author = await getAuthor2();
      const commenter = await getCommenter2();
      const threadRes = await createTrackedThread(author.accessToken, ip2, {
        title: `Anon Comment Target ${uniqueId('anon')}`,
        content: 'Thread anonim yang akan dikomentari.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(
        commenter.accessToken,
        ip2,
        {
          content: `Komentar di thread anonim ${uniqueId('c')}`,
          threadId,
        },
      );

      expect(commentRes.status).toBe(201);
      expect(commentRes.body?.status).toBe('success');
      expect(commentRes.body?.message).toBe('Komentar berhasil ditambahkan');
      expect(commentRes.body?.data?.authorId).toBeNull();
      expect(commentRes.body?.data?.author).toEqual({
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      });
      expect(
        'id' in (commentRes.body.data.author as Record<string, unknown>),
      ).toBe(false);
    });

    it('T1-F9-05: GET /api/comments/thread/:threadId on anonymous thread masks root comments and nested replies', async () => {
      const author = await getAuthor2();
      const commenter = await getCommenter2();
      const threadRes = await createTrackedThread(author.accessToken, ip2, {
        title: `Anon Tree Target ${uniqueId('anon')}`,
        content: 'Thread anonim dengan komentar bersarang.',
        subforumSlug: 'saintekfess',
        isAnonymous: true,
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const rootRes = await createTrackedComment(commenter.accessToken, ip2, {
        content: 'Komentar akar anonim',
        threadId,
      });
      expect(rootRes.status).toBe(201);
      const rootId = rootRes.body.data.id as string;

      const replyRes = await createTrackedComment(author.accessToken, ip2, {
        content: 'Balasan anonim di thread anonim',
        threadId,
        parentId: rootId,
      });
      expect(replyRes.status).toBe(201);
      const replyId = replyRes.body.data.id as string;

      for (const token of [undefined, commenter.accessToken]) {
        const listRes = await baseClient.get(
          `/api/comments/thread/${threadId}`,
          {
            ip: ip2,
            ...(token ? { token } : {}),
          },
        );
        expect(listRes.status).toBe(200);
        expect(listRes.body?.message).toBe('Daftar komentar berhasil dimuat');

        const roots = listRes.body.data as Array<Record<string, unknown>>;
        expect(roots).toHaveLength(1);
        expect(roots[0].id).toBe(rootId);
        expect(roots[0].authorId).toBeNull();
        expect(roots[0].author).toEqual({
          username: 'Saintekfess User',
          fullName: 'Anonymous',
        });
        expect('id' in (roots[0].author as Record<string, unknown>)).toBe(false);

        const replies = roots[0].replies as Array<Record<string, unknown>>;
        expect(replies).toHaveLength(1);
        expect(replies[0].id).toBe(replyId);
        expect(replies[0].authorId).toBeNull();
        expect(replies[0].author).toEqual({
          username: 'Saintekfess User',
          fullName: 'Anonymous',
        });
        expect('id' in (replies[0].author as Record<string, unknown>)).toBe(
          false,
        );
      }
    });
  });

  describe('F10: Nested Comments & Replies (/api/comments)', () => {
    const ip1 = ipForGroup(3, 10, 1);
    const ip2 = ipForGroup(3, 10, 2);
    const getUserA = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUserB = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser3 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );

    it('T1-F10-01: POST /api/comments creates root comment (201) with exact field shape', async () => {
      const userA = await getUserA();
      const threadRes = await createTrackedThread(userA.accessToken, ip1, {
        title: `Root Comment Thread ${uniqueId('c')}`,
        content: 'Thread untuk uji komentar akar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(userA.accessToken, ip1, {
        content: 'Komentar akar 1',
        threadId,
      });

      expect(commentRes.status).toBe(201);
      expect(commentRes.body?.status).toBe('success');
      expect(commentRes.body?.message).toBe('Komentar berhasil ditambahkan');

      const data = commentRes.body.data as Record<string, unknown>;
      expect(typeof data.id).toBe('string');
      expect(data.content).toBe('Komentar akar 1');
      expect(data.authorId).toBe(userA.user.id);
      expect(typeof data.createdAt).toBe('string');
      expect(data.parentId).toBeNull();
      expect(data.threadId).toBe(threadId);
      expect(data.author).toEqual({
        username: userA.user.username,
        fullName: userA.user.fullName,
      });
      expect('_count' in data).toBe(false);
      expect('replies' in data).toBe(false);
      expect('id' in (data.author as Record<string, unknown>)).toBe(false);
      expect('prodi' in (data.author as Record<string, unknown>)).toBe(false);
    });

    it('T1-F10-02: POST /api/comments with parentId creates nested reply (201)', async () => {
      const userA = await getUserA();
      const userB = await getUserB();
      const threadRes = await createTrackedThread(userA.accessToken, ip1, {
        title: `Reply Thread ${uniqueId('c')}`,
        content: 'Thread untuk uji balasan komentar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const rootRes = await createTrackedComment(userA.accessToken, ip1, {
        content: 'Komentar induk',
        threadId,
      });
      expect(rootRes.status).toBe(201);
      const rootId = rootRes.body.data.id as string;

      const replyRes = await createTrackedComment(userB.accessToken, ip1, {
        content: 'Balasan komentar',
        threadId,
        parentId: rootId,
      });

      expect(replyRes.status).toBe(201);
      expect(replyRes.body?.status).toBe('success');
      expect(replyRes.body?.message).toBe('Komentar berhasil ditambahkan');
      expect(replyRes.body?.data?.parentId).toBe(rootId);
      expect(replyRes.body?.data?.threadId).toBe(threadId);
      expect(replyRes.body?.data?.authorId).toBe(userB.user.id);
      expect(replyRes.body?.data?.author).toEqual({
        username: userB.user.username,
        fullName: userB.user.fullName,
      });
    });

    it('T1-F10-03: GET /api/comments/thread/:threadId returns nested replies tree ordered by createdAt ASC', async () => {
      const userA = await getUserA();
      const userB = await getUserB();
      const threadRes = await createTrackedThread(userA.accessToken, ip1, {
        title: `Comment Tree ${uniqueId('c')}`,
        content: 'Thread untuk uji struktur pohon komentar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const r1Res = await createTrackedComment(userA.accessToken, ip1, {
        content: 'Komentar pertama',
        threadId,
      });
      expect(r1Res.status).toBe(201);
      const r1Id = r1Res.body.data.id as string;

      await Bun.sleep(15);

      const r2Res = await createTrackedComment(userB.accessToken, ip1, {
        content: 'Komentar kedua',
        threadId,
      });
      expect(r2Res.status).toBe(201);
      const r2Id = r2Res.body.data.id as string;

      await Bun.sleep(15);

      const replyRes = await createTrackedComment(userB.accessToken, ip1, {
        content: 'Balasan pada komentar pertama',
        threadId,
        parentId: r1Id,
      });
      expect(replyRes.status).toBe(201);
      const replyId = replyRes.body.data.id as string;

      const listRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
        ip: ip1,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body?.status).toBe('success');
      expect(listRes.body?.message).toBe('Daftar komentar berhasil dimuat');

      const roots = listRes.body.data as Array<Record<string, unknown>>;
      expect(roots).toHaveLength(2);
      expect(roots[0].id).toBe(r1Id);
      expect(roots[1].id).toBe(r2Id);

      for (const node of roots) {
        expect('threadId' in node).toBe(false);
        expect(node._count).toEqual({ votes: 0 });
        expect(Array.isArray(node.replies)).toBe(true);
        const author = node.author as Record<string, unknown>;
        expect('id' in author).toBe(false);
        expect('prodi' in author).toBe(false);
      }

      const r1Replies = roots[0].replies as Array<Record<string, unknown>>;
      expect(r1Replies).toHaveLength(1);
      expect(r1Replies[0].id).toBe(replyId);
      expect(r1Replies[0].parentId).toBe(r1Id);
      expect('threadId' in r1Replies[0]).toBe(false);
      expect(r1Replies[0]._count).toEqual({ votes: 0 });
      expect(r1Replies[0].replies).toEqual([]);
      expect(roots[1].replies).toEqual([]);
    });

    it('T1-F10-04: Multi-level nested replies (depth >= 3) reconstruct accurately in replies tree', async () => {
      const user = await getUser3();
      const threadRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Deep Tree ${uniqueId('c')}`,
        content: 'Thread untuk uji komentar bersarang 3 tingkat.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const rootRes = await createTrackedComment(user.accessToken, ip2, {
        content: 'Level 1 root',
        threadId,
      });
      expect(rootRes.status).toBe(201);
      const rootId = rootRes.body.data.id as string;

      const reply1Res = await createTrackedComment(user.accessToken, ip2, {
        content: 'Level 2 reply',
        threadId,
        parentId: rootId,
      });
      expect(reply1Res.status).toBe(201);
      const reply1Id = reply1Res.body.data.id as string;

      const reply2Res = await createTrackedComment(user.accessToken, ip2, {
        content: 'Level 3 reply-to-reply',
        threadId,
        parentId: reply1Id,
      });
      expect(reply2Res.status).toBe(201);
      const reply2Id = reply2Res.body.data.id as string;

      const listRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
        ip: ip2,
      });
      expect(listRes.status).toBe(200);
      const roots = listRes.body.data as Array<Record<string, unknown>>;
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe(rootId);

      const level2 = roots[0].replies as Array<Record<string, unknown>>;
      expect(level2).toHaveLength(1);
      expect(level2[0].id).toBe(reply1Id);

      const level3 = level2[0].replies as Array<Record<string, unknown>>;
      expect(level3).toHaveLength(1);
      expect(level3[0].id).toBe(reply2Id);
      expect(level3[0].replies).toEqual([]);
    });

    it('T1-F10-05: GET /api/comments/thread/:threadId on thread with zero comments returns 200 empty array', async () => {
      const user = await getUser3();
      const threadRes = await createTrackedThread(user.accessToken, ip2, {
        title: `Empty Comments ${uniqueId('c')}`,
        content: 'Thread tanpa komentar sama sekali.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const listRes = await baseClient.get(`/api/comments/thread/${threadId}`, {
        ip: ip2,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body).toEqual({
        status: 'success',
        message: 'Daftar komentar berhasil dimuat',
        data: [],
      });
    });
  });

  describe('F11: Votes Toggle (/api/votes)', () => {
    const ip1 = ipForGroup(3, 11, 1);
    const ip2 = ipForGroup(3, 11, 2);
    const ip3 = ipForGroup(3, 11, 3);
    const ip4 = ipForGroup(3, 11, 4);

    // Dedicated isolated sessions per active-vote test (and per target in T1-F11-05)
    // so no active Vote row leaks across it(...) blocks or triggers main's Prisma OR quirk.
    const getUser01 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser02 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip1),
    );
    const getUser03 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getUser04 = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip2),
    );
    const getUser05a = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip3),
    );
    const getUser05b = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip3),
    );
    const getUser06a = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip4),
    );
    const getUser06b = createLazySession(() =>
      registerAndLogin(baseClient, tracker, {}, ip4),
    );

    it('T1-F11-01: POST /api/votes with UPVOTE and threadId creates vote and returns 200', async () => {
      const user01 = await getUser01();
      const threadRes = await createTrackedThread(user01.accessToken, ip1, {
        title: `Vote Create ${uniqueId('v')}`,
        content: 'Thread untuk pengujian pembuatan vote.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const voteRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip1, token: user01.accessToken },
      );

      expect(voteRes.status).toBe(200);
      expect(voteRes.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diberikan',
        data: { action: 'created' },
      });
    });

    it('T1-F11-02: Repeating identical UPVOTE on thread toggles vote off (deleted)', async () => {
      const user02 = await getUser02();
      const threadRes = await createTrackedThread(user02.accessToken, ip1, {
        title: `Vote Toggle Off ${uniqueId('v')}`,
        content: 'Thread untuk pengujian toggle off vote.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const firstVote = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip1, token: user02.accessToken },
      );
      expect(firstVote.status).toBe(200);
      expect(firstVote.body?.data?.action).toBe('created');

      const secondVote = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip1, token: user02.accessToken },
      );
      expect(secondVote.status).toBe(200);
      expect(secondVote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil dihapus',
        data: { action: 'deleted' },
      });

      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip1,
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body?.data?._count?.votes).toBe(0);
    });

    it('T1-F11-03: Voting DOWNVOTE after UPVOTE on same thread updates vote', async () => {
      const user03 = await getUser03();
      const threadRes = await createTrackedThread(user03.accessToken, ip2, {
        title: `Vote Switch ${uniqueId('v')}`,
        content: 'Thread untuk pengujian pergantian vote.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const upRes = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip2, token: user03.accessToken },
      );
      expect(upRes.status).toBe(200);
      expect(upRes.body?.data?.action).toBe('created');

      const downRes = await baseClient.post(
        '/api/votes',
        { type: 'DOWNVOTE', threadId },
        { ip: ip2, token: user03.accessToken },
      );
      expect(downRes.status).toBe(200);
      expect(downRes.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diperbarui',
        data: { action: 'updated' },
      });

      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip2,
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body?.data?._count?.votes).toBe(1);
    });

    it('T1-F11-04: POST /api/votes on commentId creates, updates, and deletes vote with 200', async () => {
      const user04 = await getUser04();
      const threadRes = await createTrackedThread(user04.accessToken, ip2, {
        title: `Comment Vote ${uniqueId('v')}`,
        content: 'Thread untuk pengujian vote komentar.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(user04.accessToken, ip2, {
        content: 'Komentar target vote',
        threadId,
      });
      expect(commentRes.status).toBe(201);
      const commentId = commentRes.body.data.id as string;

      const createVote = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', commentId },
        { ip: ip2, token: user04.accessToken },
      );
      expect(createVote.status).toBe(200);
      expect(createVote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diberikan',
        data: { action: 'created' },
      });

      const updateVote = await baseClient.post(
        '/api/votes',
        { type: 'DOWNVOTE', commentId },
        { ip: ip2, token: user04.accessToken },
      );
      expect(updateVote.status).toBe(200);
      expect(updateVote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diperbarui',
        data: { action: 'updated' },
      });

      const deleteVote = await baseClient.post(
        '/api/votes',
        { type: 'DOWNVOTE', commentId },
        { ip: ip2, token: user04.accessToken },
      );
      expect(deleteVote.status).toBe(200);
      expect(deleteVote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil dihapus',
        data: { action: 'deleted' },
      });
    });

    it('T1-F11-05: Re-voting after toggle off creates fresh vote and updates thread and comment _count.votes', async () => {
      const user05a = await getUser05a();
      const user05b = await getUser05b();

      const threadRes = await createTrackedThread(user05a.accessToken, ip3, {
        title: `Revote Thread ${uniqueId('v')}`,
        content: 'Thread untuk uji vote ulang setelah toggle off.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const commentRes = await createTrackedComment(user05a.accessToken, ip3, {
        content: 'Komentar untuk uji vote ulang',
        threadId,
      });
      expect(commentRes.status).toBe(201);
      const commentId = commentRes.body.data.id as string;

      // Separate dedicated users per target (user05a -> thread, user05b -> comment) avoids main's Prisma OR quirk
      const tCreate = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip3, token: user05a.accessToken },
      );
      expect(tCreate.status).toBe(200);
      expect(tCreate.body?.data?.action).toBe('created');

      const tDelete = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip3, token: user05a.accessToken },
      );
      expect(tDelete.status).toBe(200);
      expect(tDelete.body?.data?.action).toBe('deleted');

      const cCreate = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', commentId },
        { ip: ip3, token: user05b.accessToken },
      );
      expect(cCreate.status).toBe(200);
      expect(cCreate.body?.data?.action).toBe('created');

      const cDelete = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', commentId },
        { ip: ip3, token: user05b.accessToken },
      );
      expect(cDelete.status).toBe(200);
      expect(cDelete.body?.data?.action).toBe('deleted');

      const threadOffRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip3,
      });
      expect(threadOffRes.status).toBe(200);
      expect(threadOffRes.body?.data?._count?.votes).toBe(0);

      const commentsOffRes = await baseClient.get(
        `/api/comments/thread/${threadId}`,
        { ip: ip3 },
      );
      expect(commentsOffRes.status).toBe(200);
      expect(commentsOffRes.body?.data?.[0]?._count?.votes).toBe(0);

      const tRevote = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip3, token: user05a.accessToken },
      );
      expect(tRevote.status).toBe(200);
      expect(tRevote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diberikan',
        data: { action: 'created' },
      });

      const cRevote = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', commentId },
        { ip: ip3, token: user05b.accessToken },
      );
      expect(cRevote.status).toBe(200);
      expect(cRevote.body).toEqual({
        status: 'success',
        message: 'Vote berhasil diberikan',
        data: { action: 'created' },
      });

      const threadOnRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip3,
      });
      expect(threadOnRes.status).toBe(200);
      expect(threadOnRes.body?.data?._count?.votes).toBe(1);

      const commentsOnRes = await baseClient.get(
        `/api/comments/thread/${threadId}`,
        { ip: ip3 },
      );
      expect(commentsOnRes.status).toBe(200);
      expect(commentsOnRes.body?.data?.[0]?._count?.votes).toBe(1);
    });

    it('T1-F11-06: Two distinct users can independently vote on the same thread (_count.votes === 2)', async () => {
      const user06a = await getUser06a();
      const user06b = await getUser06b();

      const threadRes = await createTrackedThread(user06a.accessToken, ip4, {
        title: `Multi Vote Thread ${uniqueId('v')}`,
        content: 'Thread untuk pengujian vote dari dua pengguna.',
        subforumSlug: 'informatika',
      });
      expect(threadRes.status).toBe(201);
      const threadId = threadRes.body.data.id as string;

      const voteA = await baseClient.post(
        '/api/votes',
        { type: 'UPVOTE', threadId },
        { ip: ip4, token: user06a.accessToken },
      );
      expect(voteA.status).toBe(200);
      expect(voteA.body?.data?.action).toBe('created');

      const voteB = await baseClient.post(
        '/api/votes',
        { type: 'DOWNVOTE', threadId },
        { ip: ip4, token: user06b.accessToken },
      );
      expect(voteB.status).toBe(200);
      expect(voteB.body?.data?.action).toBe('created');

      const detailRes = await baseClient.get(`/api/threads/${threadId}`, {
        ip: ip4,
      });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body?.data?._count?.votes).toBe(2);
    });
  });
});
