import { AuthenticationError } from '../exceptions/AuthenticationError.ts';
import { InvariantError } from '../exceptions/InvariantError.ts';
import { authenticationRepository } from '../repositories/authenticationRepository.ts';
import {
  userRepository,
  type UserWithPassword,
} from '../repositories/userRepository.ts';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../utils/jwt.ts';
import { verifyPassword } from '../utils/password.ts';

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticationServiceDeps {
  userRepository?: {
    findUserByEmail: (email: string) => Promise<UserWithPassword | null>;
    findUserByUsername: (username: string) => Promise<UserWithPassword | null>;
  };
  authenticationRepository?: {
    addToken: (token: string) => Promise<unknown>;
    checkToken: (token: string) => Promise<{ token: string } | null>;
    deleteToken: (token: string) => Promise<unknown>;
  };
  password?: {
    verifyPassword: (plain: string, hash: string) => Promise<boolean>;
  };
  jwt?: {
    signAccessToken: (payload: JwtPayload) => string;
    signRefreshToken: (payload: JwtPayload) => string;
    verifyRefreshToken: (token: string) => JwtPayload;
  };
}

export interface AuthenticationService {
  login: (input: LoginInput) => Promise<AuthTokens>;
  refresh: (refreshToken: string) => Promise<string>;
  logout: (refreshToken: string) => Promise<void>;
}

export function createAuthenticationService(
  deps: AuthenticationServiceDeps = {},
): AuthenticationService {
  const userRepo = deps.userRepository ?? userRepository;
  const authRepo = deps.authenticationRepository ?? authenticationRepository;
  const passwordHelper = deps.password ?? { verifyPassword };
  const jwtHelper = deps.jwt ?? {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
  };

  return {
    async login({ identifier, password }: LoginInput): Promise<AuthTokens> {
      let foundUser = await userRepo.findUserByEmail(identifier);

      if (!foundUser) {
        foundUser = await userRepo.findUserByUsername(identifier);
      }

      if (
        !foundUser ||
        !(await passwordHelper.verifyPassword(password, foundUser.password))
      ) {
        throw new AuthenticationError('Kredensial tidak valid');
      }

      const payload: JwtPayload = {
        id: foundUser.id,
        role: foundUser.role,
        prodi: foundUser.prodi,
      };

      const accessToken = jwtHelper.signAccessToken(payload);
      const refreshToken = jwtHelper.signRefreshToken(payload);

      await authRepo.addToken(refreshToken);

      return { accessToken, refreshToken };
    },

    async refresh(refreshToken: string): Promise<string> {
      const tokenInDb = await authRepo.checkToken(refreshToken);
      if (!tokenInDb) {
        throw new InvariantError('Refresh token tidak valid');
      }

      try {
        const payload = jwtHelper.verifyRefreshToken(refreshToken);
        return jwtHelper.signAccessToken({
          id: payload.id,
          role: payload.role,
          prodi: payload.prodi,
        });
      } catch {
        await authRepo.deleteToken(refreshToken);
        throw new AuthenticationError('Refresh token kadaluarsa');
      }
    },

    async logout(refreshToken: string): Promise<void> {
      const tokenInDb = await authRepo.checkToken(refreshToken);
      if (!tokenInDb) {
        throw new InvariantError('Refresh token tidak valid');
      }

      await authRepo.deleteToken(refreshToken);
    },
  };
}

export const authenticationService = createAuthenticationService();

export default authenticationService;
