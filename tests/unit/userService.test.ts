import { describe, expect, it, mock } from 'bun:test';
import type { DbOrTx } from '../../src/db/index.ts';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/forum_saintek_test';

import type {
  CreateUserData,
  PublicUserRecord,
  UserWithPassword,
} from '../../src/repositories/userRepository.ts';

const { InvariantError } = await import(
  '../../src/exceptions/InvariantError.ts'
);
const { createUserService } = await import('../../src/services/userService.ts');

const fakeTx = 'tx_client' as unknown as DbOrTx;

function buildDeps() {
  const userRepository = {
    findUserByEmail: mock(
      async (_email: string, _tx?: DbOrTx): Promise<UserWithPassword | null> =>
        null,
    ),
    findUserByUsername: mock(
      async (
        _username: string,
        _tx?: DbOrTx,
      ): Promise<UserWithPassword | null> => null,
    ),
    createUser: mock(
      async (
        data: CreateUserData,
        _tx?: DbOrTx,
      ): Promise<PublicUserRecord> => ({
        id: '2',
        email: data.email,
        username: data.username,
        fullName: data.fullName ?? '',
        prodi: data.prodi,
        role: data.role ?? 'USER',
        createdAt: new Date(),
      }),
    ),
    findAllUsers: mock(
      async (_tx?: DbOrTx): Promise<PublicUserRecord[]> => [],
    ),
  };
  const password = {
    hashPassword: mock(async () => '$2b$10$hashedPassword123'),
  };
  const transactionCalls: Array<(tx: DbOrTx) => Promise<unknown>> = [];
  const transaction = async <T>(cb: (tx: DbOrTx) => Promise<T>): Promise<T> => {
    transactionCalls.push(cb);
    return cb(fakeTx);
  };

  return { userRepository, password, transaction, transactionCalls };
}

describe('userService Unit Test', () => {
  describe('register', () => {
    it('throws InvariantError inside transaction when email already exists', async () => {
      const deps = buildDeps();
      const userData = {
        email: 'test@student.uin-suka.ac.id',
        username: 'testuser',
        password: 'password123',
        prodi: 'Informatika',
      };
      deps.userRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: userData.email,
      } as never);

      const service = createUserService(deps);

      await expect(service.register(userData)).rejects.toThrow(InvariantError);
      expect(deps.transactionCalls).toHaveLength(1);
      expect(deps.userRepository.findUserByEmail).toHaveBeenCalledWith(
        userData.email,
        fakeTx,
      );
      expect(deps.userRepository.findUserByUsername).not.toHaveBeenCalled();
    });

    it('throws InvariantError inside transaction when username already exists', async () => {
      const deps = buildDeps();
      const userData = {
        email: 'test@student.uin-suka.ac.id',
        username: 'testuser',
        password: 'password123',
        prodi: 'Informatika',
      };
      deps.userRepository.findUserByEmail.mockResolvedValue(null);
      deps.userRepository.findUserByUsername.mockResolvedValue({
        id: '1',
        username: userData.username,
      } as never);

      const service = createUserService(deps);

      await expect(service.register(userData)).rejects.toThrow(InvariantError);
      expect(deps.userRepository.findUserByUsername).toHaveBeenCalledWith(
        userData.username,
        fakeTx,
      );
      expect(deps.userRepository.createUser).not.toHaveBeenCalled();
    });

    it('hashes password and forces role USER when registering a valid user', async () => {
      const deps = buildDeps();
      const userData = {
        email: 'new@student.uin-suka.ac.id',
        username: 'newuser',
        password: 'password123',
        fullName: 'New User',
        prodi: 'Informatika',
        role: 'ADMIN',
      };
      const expectedUser = {
        id: '2',
        email: 'new@student.uin-suka.ac.id',
        username: 'newuser',
        fullName: 'New User',
        prodi: 'Informatika',
        role: 'USER' as const,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      deps.userRepository.createUser.mockResolvedValue(expectedUser);

      const service = createUserService(deps);
      const result = await service.register(userData);

      expect(result).toEqual(expectedUser);
      expect(deps.userRepository.findUserByEmail).toHaveBeenCalledWith(
        userData.email,
        fakeTx,
      );
      expect(deps.userRepository.findUserByUsername).toHaveBeenCalledWith(
        userData.username,
        fakeTx,
      );
      expect(deps.password.hashPassword).toHaveBeenCalledWith(
        userData.password,
      );
      expect(deps.userRepository.createUser).toHaveBeenCalledWith(
        {
          ...userData,
          password: '$2b$10$hashedPassword123',
          role: 'USER',
        },
        fakeTx,
      );
    });
  });

  describe('getAllUsers', () => {
    it('returns all users from userRepository.findAllUsers', async () => {
      const deps = buildDeps();
      const expectedUsers = [
        {
          id: '1',
          email: 'a@student.uin-suka.ac.id',
          username: 'user1',
          fullName: 'User One',
          prodi: 'Informatika',
          role: 'USER' as const,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: '2',
          email: 'b@student.uin-suka.ac.id',
          username: 'user2',
          fullName: 'User Two',
          prodi: 'Matematika',
          role: 'ADMIN' as const,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ];
      deps.userRepository.findAllUsers.mockResolvedValue(expectedUsers);

      const service = createUserService(deps);
      const result = await service.getAllUsers();

      expect(result).toEqual(expectedUsers);
      expect(deps.userRepository.findAllUsers).toHaveBeenCalledTimes(1);
    });
  });
});
