import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth, homePathFor } from '@/stores/auth';
import type { Role } from '@/types';

/** Redirects guests to /login (keeping the return path) and wrong roles to their home. */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const user = useAuth((s) => s.user);
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}
