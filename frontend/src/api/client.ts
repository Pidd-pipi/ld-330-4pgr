import axios from 'axios';
import { message } from 'antd';
import { session } from './session';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

// 保留现有接口风格：登录后所有请求自动携带 JWT
apiClient.interceptors.request.use((config) => {
  const token = session.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      session.clear();
      if (!window.location.pathname.endsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

/** 统一提取后端 NestJS 校验/业务错误提示 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(payload?.message)) {
      return payload.message.join('；');
    }
    if (payload?.message) {
      return payload.message;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export function notifyError(error: unknown, fallback = '操作失败') {
  message.error(getErrorMessage(error, fallback));
}
