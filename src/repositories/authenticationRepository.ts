import { eq } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.ts';
import { authentication, type Authentication } from '../db/schema.ts';

export async function addToken(
  token: string,
  tx: DbOrTx = db,
): Promise<Authentication> {
  const [created] = await tx
    .insert(authentication)
    .values({ token })
    .returning({ token: authentication.token });

  if (!created) {
    throw new Error('Failed to add token');
  }

  return created;
}

export async function checkToken(
  token: string,
  tx: DbOrTx = db,
): Promise<Authentication | null> {
  const rows = await tx
    .select({ token: authentication.token })
    .from(authentication)
    .where(eq(authentication.token, token))
    .limit(1);

  return rows[0] ?? null;
}

export async function deleteToken(
  token: string,
  tx: DbOrTx = db,
): Promise<void> {
  await tx.delete(authentication).where(eq(authentication.token, token));
}

export const authenticationRepository = {
  addToken,
  checkToken,
  deleteToken,
};

export default authenticationRepository;
