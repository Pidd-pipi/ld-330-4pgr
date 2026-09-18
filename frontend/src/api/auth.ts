import { apiClient } from './client';
import type { CurrentUser } from '../types/emr';

interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export const login = async (username: string, password: string) => {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { username, password });
  return data;
};
