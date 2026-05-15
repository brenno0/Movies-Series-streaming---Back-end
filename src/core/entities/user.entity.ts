export interface UserEntity {
  id: string;
  email: string;
  name: string;
  password: string;
  preferences?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
