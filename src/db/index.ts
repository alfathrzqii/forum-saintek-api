import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

export const client = postgres(connectionString);
export { client as sql };
export const db = drizzle(client, { schema });

export type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
