import type { Context } from 'elysia';
import {
  userService,
  type RegisterUserInput,
  type UserService,
} from '../../services/userService.ts';
import { successResponse } from '../../utils/response.ts';

type StatusSetter = Pick<Context['set'], 'status'>;

export function createUserController(service: UserService = userService) {
  return {
    async postUser({
      body,
      set,
    }: {
      body: RegisterUserInput;
      set: StatusSetter;
    }) {
      const createdUser = await service.register(body);

      return successResponse(
        set,
        'User berhasil didaftarkan',
        createdUser,
        201,
      );
    },

    async getAllUsers({ set }: { set: StatusSetter }) {
      const users = await service.getAllUsers();

      return successResponse(set, 'Daftar user berhasil dimuat', users);
    },
  };
}

export const userController = createUserController();

export default userController;
