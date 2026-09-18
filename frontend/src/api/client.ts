import axios, { AxiosError } from 'axios';
import type { CurrentUser } from '../types/emr';

const TOKEN_KEY = 'gbemr_token';
const USER_KEY = 'gbemr_user';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

// 保持现有接口风格：统一注入 JWT，401 时回到登录入口
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string | string[] }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!location.pathname.endsWith('/login') && location.pathname !== '/login') {
        location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = (): CurrentUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as CurrentUser) : null;
};

export const saveSession = (token: string, user: CurrentUser) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/** 提取后端校验消息（Nest 错误体 message 可能是字符串或数组） */
export const pickErrorMessage = (
  error: unknown,
  fallback = '操作失败，请稍后重试',
): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) {
      return message.join('；');
    }
    if (message) {
      return message;
    }
  }
  return fallback;
};
