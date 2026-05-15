import { UsersPrismaRepository } from '@/infrastructure/database/repositories/users.repository';
import { AuthenticateUseCase } from '../auth/authenticate.use-case';
import { CreateUserUseCase } from '../auth/create-user.use-case';
import { GetUserUseCase } from '../auth/get-user.use-case';

export function makeCreateUser() {
  return new CreateUserUseCase(new UsersPrismaRepository());
}

export function makeAuthenticate() {
  return new AuthenticateUseCase(new UsersPrismaRepository());
}

export function makeGetUser() {
  return new GetUserUseCase(new UsersPrismaRepository());
}
