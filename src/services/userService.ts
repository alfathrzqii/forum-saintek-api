import { db, type DbOrTx } from '../db/index.ts';
import { InvariantError } from '../exceptions/InvariantError.ts';
import {
  userRepository,
  type CreateUserData,
  type PublicUserRecord,
  type UserWithPassword,
} from '../repositories/userRepository.ts';
import { hashPassword } from '../utils/password.ts';

export interface RegisterUserInput {
  email: string;
  username: string;
  password: string;
  fullName?: string;
  prodi: string;
}

export interface UserServiceDeps {
  userRepository?: {
    findUserByEmail: (
      email: string,
      tx?: DbOrTx,
    ) => Promise<UserWithPassword | null>;
    findUserByUsername: (
      username: string,
      tx?: DbOrTx,
    ) => Promise<UserWithPassword | null>;
    createUser: (
      userData: CreateUserData,
      tx?: DbOrTx,
    ) => Promise<PublicUserRecord>;
    findAllUsers: (tx?: DbOrTx) => Promise<PublicUserRecord[]>;
  };
  password?: {
    hashPassword: (plain: string) => Promise<string>;
  };
  transaction?: <T>(callback: (tx: DbOrTx) => Promise<T>) => Promise<T>;
}

export interface UserService {
  register: (userData: RegisterUserInput) => Promise<PublicUserRecord>;
  getAllUsers: () => Promise<PublicUserRecord[]>;
}

export function createUserService(deps: UserServiceDeps = {}): UserService {
  const userRepo = deps.userRepository ?? userRepository;
  const passwordHelper = deps.password ?? { hashPassword };
  const runInTransaction =
    deps.transaction ??
    (<T>(callback: (tx: DbOrTx) => Promise<T>): Promise<T> =>
      db.transaction(callback));

  return {
    async register(userData: RegisterUserInput): Promise<PublicUserRecord> {
      return runInTransaction(async (tx) => {
        const existingEmail = await userRepo.findUserByEmail(
          userData.email,
          tx,
        );
        if (existingEmail) {
          throw new InvariantError('Email sudah digunakan');
        }

        const existingUsername = await userRepo.findUserByUsername(
          userData.username,
          tx,
        );
        if (existingUsername) {
          throw new InvariantError('Username sudah digunakan');
        }

        const hashedPassword = await passwordHelper.hashPassword(
          userData.password,
        );

        return userRepo.createUser(
          {
            ...userData,
            password: hashedPassword,
            role: 'USER',
          },
          tx,
        );
      });
    },

    async getAllUsers(): Promise<PublicUserRecord[]> {
      return userRepo.findAllUsers();
    },
  };
}

export const userService = createUserService();

export default userService;
