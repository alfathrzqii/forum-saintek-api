import type { Role } from '../../db/schema.ts';
import { AuthorizationError } from '../../exceptions/AuthorizationError.ts';
import type { AuthUser } from './authenticationMiddleware.ts';

export function requireRole(
  user: AuthUser | null | undefined,
  allowedRoles: readonly Role[],
): void {
  if (!user || !allowedRoles.includes(user.role)) {
    throw new AuthorizationError(
      'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
    );
  }
}

export function roleGuard(allowedRoles: readonly Role[]) {
  return ({ user }: { user?: AuthUser | null }) => {
    requireRole(user, allowedRoles);
  };
}
