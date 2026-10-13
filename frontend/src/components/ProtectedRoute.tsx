import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../lib/types';

type Props = {
  requiredRole?: UserRole;
};

export default function ProtectedRoute({ requiredRole }: Props) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-athlon border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-text-3">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole && !(requiredRole === 'SCOUT' && user?.role === 'ADMIN')) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
