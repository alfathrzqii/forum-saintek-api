import { eq } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.ts';
import { user, type Role } from '../db/schema.ts';

export interface UserWithPassword {
  id: string;
  email: string;
  username: string;
  password: string;
  fullName: string;
  prodi: string;
  role: Role;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: Role;
  prodi: string;
}

export interface PublicUserRecord {
  id: string;
  email: string;
  username: string;
  fullName: string;
  prodi: string;
  role: Role;
  createdAt: Date;
}

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  fullName?: string;
  prodi: string;
  role?: Role;
}

export async function findUserByEmail(
  email: string,
  tx: DbOrTx = db,
): Promise<UserWithPassword | null> {
  const rows = await tx
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      password: user.password,
      fullName: user.fullName,
      prodi: user.prodi,
      role: user.role,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  return rows[0] ?? null;
}

export async function findUserByUsername(
  username: string,
  tx: DbOrTx = db,
): Promise<UserWithPassword | null> {
  const rows = await tx
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      password: user.password,
      fullName: user.fullName,
      prodi: user.prodi,
      role: user.role,
    })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);

  return rows[0] ?? null;
}

export async function findUserById(
  id: string,
  tx: DbOrTx = db,
): Promise<AuthUserRecord | null> {
  const rows = await tx
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      prodi: user.prodi,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function createUser(
  userData: CreateUserData,
  tx: DbOrTx = db,
): Promise<PublicUserRecord> {
  const [created] = await tx
    .insert(user)
    .values(userData as typeof user.$inferInsert)
    .returning({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      prodi: user.prodi,
      role: user.role,
      createdAt: user.createdAt,
    });

  if (!created) {
    throw new Error('Failed to create user');
  }

  return created;
}

export async function findAllUsers(
  tx: DbOrTx = db,
): Promise<PublicUserRecord[]> {
  return tx
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      prodi: user.prodi,
      createdAt: user.createdAt,
    })
    .from(user);
}

export const userRepository = {
  findUserByEmail,
  findUserByUsername,
  findUserById,
  createUser,
  findAllUsers,
};

export default userRepository;
