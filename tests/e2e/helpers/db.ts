import postgres from 'postgres';
import type { Sql } from 'postgres';

export type E2EUserRole = 'USER' | 'MODERATOR' | 'ADMIN';

export interface SeededSubforumSpec {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
}

export const SEEDED_SUBFORUMS: readonly SeededSubforumSpec[] = [
  {
    name: 'Ilmu Lingkungan',
    slug: 'ilmu-lingkungan',
    description: 'Diskusi seputar isu lingkungan dan prodi IL.',
  },
  {
    name: 'Teknologi Pangan',
    slug: 'teknologi-pangan',
    description: 'Tempat berbagi info seputar teknologi pangan.',
  },
  {
    name: 'Sains Data',
    slug: 'sains-data',
    description: 'Analisis data, AI, dan statistik ada di sini.',
  },
  {
    name: 'Bioteknologi',
    slug: 'bioteknologi',
    description: 'Segala hal tentang rekayasa hayati.',
  },
  {
    name: 'Informatika',
    slug: 'informatika',
    description: 'Coding, networking, dan kawan-kawan.',
  },
  {
    name: 'Saintekfess',
    slug: 'saintekfess',
    description: 'Curhatan anonim warga Saintek.',
  },
  {
    name: 'Lost and Found',
    slug: 'lost-and-found',
    description: 'Barang hilang? Cari di sini.',
  },
] as const;

export const SEEDED_SUBFORUM_SLUGS: readonly string[] = SEEDED_SUBFORUMS.map(
  (s) => s.slug,
);

const SEEDED_SLUG_SET = new Set<string>(SEEDED_SUBFORUM_SLUGS);

export interface E2ECleanupTracker {
  tokens?: string[];
  voteIds?: string[];
  commentIds?: string[];
  threadIds?: string[];
  subforumIds?: string[];
  subforumSlugs?: string[];
  userIds?: string[];
  userEmails?: string[];
}

export interface MutableE2ECleanupTracker {
  tokens: string[];
  voteIds: string[];
  commentIds: string[];
  threadIds: string[];
  subforumIds: string[];
  subforumSlugs: string[];
  userIds: string[];
  userEmails: string[];
}

export function createCleanupTracker(): MutableE2ECleanupTracker {
  return {
    tokens: [],
    voteIds: [],
    commentIds: [],
    threadIds: [],
    subforumIds: [],
    subforumSlugs: [],
    userIds: [],
    userEmails: [],
  };
}

let sqlClient: Sql | null = null;

export function isE2EDbDisabled(): boolean {
  const raw = process.env.E2E_NO_DB?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function getDb(): Sql {
  if (isE2EDbDisabled()) {
    throw new Error(
      'Direct PostgreSQL helper call failed: E2E_NO_DB=1 is set, disabling direct DB access.',
    );
  }

  if (sqlClient) {
    return sqlClient;
  }

  const connectionUrl =
    process.env.E2E_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionUrl) {
    throw new Error(
      'Database connection string missing: set E2E_DATABASE_URL or DATABASE_URL (or set E2E_NO_DB=1 when DB helpers are not used).',
    );
  }

  sqlClient = postgres(connectionUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: false,
  });

  return sqlClient;
}

function dedupe(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return Array.from(new Set(values.filter((v) => v.length > 0)));
}

export async function ensureSeededSubforums(): Promise<void> {
  if (isE2EDbDisabled()) {
    return;
  }

  const sql = getDb();
  for (const s of SEEDED_SUBFORUMS) {
    await sql`
      INSERT INTO "Subforum" ("id", "name", "slug", "description")
      VALUES (${crypto.randomUUID()}, ${s.name}, ${s.slug}, ${s.description})
      ON CONFLICT ("slug") DO NOTHING
    `;
  }
}

export async function promoteUserRole(
  email: string,
  role: E2EUserRole,
): Promise<void> {
  const sql = getDb();
  const rows = await sql<{ id: string }[]>`
    UPDATE "User"
    SET "role" = ${role}
    WHERE "email" = ${email}
    RETURNING "id"
  `;

  if (rows.length === 0) {
    throw new Error(`promoteUserRole: no "User" row found for email "${email}".`);
  }
}

export async function deleteUserById(id: string): Promise<void> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM "Vote"
      WHERE "userId" = ${id}
    `;

    const commentRows = await tx<{ id: string }[]>`
      SELECT "id"
      FROM "Comment"
      WHERE "authorId" = ${id}
         OR "threadId" IN (
           SELECT "id" FROM "Thread" WHERE "authorId" = ${id}
         )
    `;
    const commentIds = commentRows.map((r) => r.id);

    if (commentIds.length > 0) {
      await tx`
        UPDATE "Comment"
        SET "parentId" = NULL
        WHERE "parentId" = ANY(${commentIds}::text[])
      `;
      await tx`
        DELETE FROM "Comment"
        WHERE "id" = ANY(${commentIds}::text[])
      `;
    }

    await tx`
      DELETE FROM "Thread"
      WHERE "authorId" = ${id}
    `;

    await tx`
      DELETE FROM "User"
      WHERE "id" = ${id}
    `;
  });
}

export async function cleanupE2EData(tracker: E2ECleanupTracker): Promise<void> {
  if (isE2EDbDisabled()) {
    return;
  }

  const tokens = dedupe(tracker.tokens);
  const voteIds = dedupe(tracker.voteIds);
  const trackedCommentIds = dedupe(tracker.commentIds);
  const trackedThreadIds = dedupe(tracker.threadIds);
  const trackedSubforumIds = dedupe(tracker.subforumIds);
  const trackedSubforumSlugs = dedupe(tracker.subforumSlugs).filter(
    (slug) => !SEEDED_SLUG_SET.has(slug),
  );
  const trackedUserIds = dedupe(tracker.userIds);
  const trackedUserEmails = dedupe(tracker.userEmails);

  if (
    tokens.length === 0 &&
    voteIds.length === 0 &&
    trackedCommentIds.length === 0 &&
    trackedThreadIds.length === 0 &&
    trackedSubforumIds.length === 0 &&
    trackedSubforumSlugs.length === 0 &&
    trackedUserIds.length === 0 &&
    trackedUserEmails.length === 0
  ) {
    return;
  }

  const sql = getDb();
  await sql.begin(async (tx) => {
    const emailUserRows =
      trackedUserEmails.length > 0
        ? await tx<{ id: string }[]>`
            SELECT "id"
            FROM "User"
            WHERE "email" = ANY(${trackedUserEmails}::text[])
          `
        : [];
    const resolvedUserIds = dedupe([
      ...trackedUserIds,
      ...emailUserRows.map((r) => r.id),
    ]);

    const subforumRows =
      trackedSubforumIds.length > 0 || trackedSubforumSlugs.length > 0
        ? await tx<{ id: string }[]>`
            SELECT "id"
            FROM "Subforum"
            WHERE ("id" = ANY(${trackedSubforumIds}::text[])
               OR "slug" = ANY(${trackedSubforumSlugs}::text[]))
              AND "slug" != ALL(${[...SEEDED_SUBFORUM_SLUGS]}::text[])
          `
        : [];
    const resolvedSubforumIds = dedupe(subforumRows.map((r) => r.id));

    const extraThreadRows =
      resolvedUserIds.length > 0 || resolvedSubforumIds.length > 0
        ? await tx<{ id: string }[]>`
            SELECT "id"
            FROM "Thread"
            WHERE "authorId" = ANY(${resolvedUserIds}::text[])
               OR "subforumId" = ANY(${resolvedSubforumIds}::text[])
          `
        : [];
    const resolvedThreadIds = dedupe([
      ...trackedThreadIds,
      ...extraThreadRows.map((r) => r.id),
    ]);

    const extraCommentRows =
      resolvedUserIds.length > 0 || resolvedThreadIds.length > 0
        ? await tx<{ id: string }[]>`
            SELECT "id"
            FROM "Comment"
            WHERE "authorId" = ANY(${resolvedUserIds}::text[])
               OR "threadId" = ANY(${resolvedThreadIds}::text[])
          `
        : [];
    const resolvedCommentIds = dedupe([
      ...trackedCommentIds,
      ...extraCommentRows.map((r) => r.id),
    ]);

    // 1. Authentication
    if (tokens.length > 0) {
      await tx`
        DELETE FROM "Authentication"
        WHERE "token" = ANY(${tokens}::text[])
      `;
    }

    // 2. Vote
    if (
      voteIds.length > 0 ||
      resolvedUserIds.length > 0 ||
      resolvedThreadIds.length > 0 ||
      resolvedCommentIds.length > 0
    ) {
      await tx`
        DELETE FROM "Vote"
        WHERE "id" = ANY(${voteIds}::text[])
           OR "userId" = ANY(${resolvedUserIds}::text[])
           OR "threadId" = ANY(${resolvedThreadIds}::text[])
           OR "commentId" = ANY(${resolvedCommentIds}::text[])
      `;
    }

    // 3. Comment (pre-detach self-ref parentId before deleting)
    if (resolvedCommentIds.length > 0) {
      await tx`
        UPDATE "Comment"
        SET "parentId" = NULL
        WHERE "parentId" = ANY(${resolvedCommentIds}::text[])
      `;
      await tx`
        DELETE FROM "Comment"
        WHERE "id" = ANY(${resolvedCommentIds}::text[])
      `;
    }

    // 4. Thread
    if (resolvedThreadIds.length > 0) {
      await tx`
        DELETE FROM "Thread"
        WHERE "id" = ANY(${resolvedThreadIds}::text[])
      `;
    }

    // 5. Non-seeded Subforum
    if (resolvedSubforumIds.length > 0) {
      await tx`
        DELETE FROM "Subforum"
        WHERE "id" = ANY(${resolvedSubforumIds}::text[])
          AND "slug" != ALL(${[...SEEDED_SUBFORUM_SLUGS]}::text[])
      `;
    }

    // 6. User
    if (resolvedUserIds.length > 0) {
      await tx`
        DELETE FROM "User"
        WHERE "id" = ANY(${resolvedUserIds}::text[])
      `;
    }
  });
}

export async function closeE2EDb(): Promise<void> {
  if (!sqlClient) {
    return;
  }
  const clientToClose = sqlClient;
  sqlClient = null;
  await clientToClose.end({ timeout: 5 });
}
