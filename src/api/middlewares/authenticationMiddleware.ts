import { Elysia } from 'elysia';
import { AuthenticationError } from '../../exceptions/AuthenticationError.ts';
import {
  userRepository,
  type AuthUserRecord,
} from '../../repositories/userRepository.ts';
import { verifyAccessToken, type JwtPayload } from '../../utils/jwt.ts';

export type AuthUser = AuthUserRecord;

export interface AuthMiddlewareDeps {
  verifyAccessToken?: (token: string) => JwtPayload;
  findUserById?: (id: string) => Promise<AuthUser | null>;
}

export async function authenticateRequest(
  request: Request,
  deps: AuthMiddlewareDeps = {},
): Promise<AuthUser> {
  const verifyToken = deps.verifyAccessToken ?? verifyAccessToken;
  const findUser = deps.findUserById ?? userRepository.findUserById;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Token tidak ditemukan atau format salah');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new AuthenticationError('Token tidak valid atau sudah kadaluarsa');
  }

  let decoded: JwtPayload;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new AuthenticationError('Token tidak valid atau sudah kadaluarsa');
  }

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof decoded.id !== 'string' ||
    decoded.id.length === 0
  ) {
    throw new AuthenticationError('Token tidak valid atau sudah kadaluarsa');
  }

  const foundUser = await findUser(decoded.id);
  if (!foundUser) {
    throw new AuthenticationError(
      'User sudah tidak terdaftar atau akun telah dihapus',
    );
  }

  return foundUser;
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps = {}) {
  return new Elysia().resolve({ as: 'scoped' }, async ({ request }) => {
    const user = await authenticateRequest(request, deps);
    return { user };
  });
}
