import type { SessionUser } from '../types/emr';

const TOKEN_KEY = 'gbemr_token';
const USER_KEY = 'gbemr_user';

export const session = {
  getToken(): string | null {
    return window.localStorage.getItem(TOKEN_KEY);
  },
  getUser(): SessionUser | null {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },
  save(token: string, user: SessionUser) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
};
