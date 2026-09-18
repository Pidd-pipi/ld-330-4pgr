import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getStoredUser } from '../api/client';
import type { CurrentUser } from '../types/emr';

interface RequireAuthProps {
  children: ReactNode;
  roles?: CurrentUser['role'][];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
