import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router';

export default function FantasyProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/auth/login');
  }

  return (
    <div className="px-4 py-4 animate-fade-in max-w-2xl mx-auto">
      <h1 className="font-condensed font-black text-[22px] text-text-1 tracking-tight mb-5">My Profile</h1>

      {/* User info */}
      <div className="p-4 mb-4" style={{ background: '#111812', borderRadius: 8, border: '1px solid #243028' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#22C55E', color: '#0A0F0C' }}>
            <span className="font-condensed font-black text-[20px]">{user?.display_name?.charAt(0).toUpperCase() ?? 'U'}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[15px] text-text-1 truncate">{user?.display_name}</p>
            <p className="text-[11px] font-mono text-text-3 truncate">{user?.email}</p>
          </div>
        </div>
        <div className="pt-3 border-t border-border">
          <span className="text-[9px] font-condensed font-bold tracking-widest px-2 py-1" style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', borderRadius: 3 }}>
            {user?.role ?? 'USER'}
          </span>
        </div>
      </div>

      {/* Quick links */}
      {[
        { label: 'My Fantasy Team', to: '/app/fantasy/team' },
        { label: 'Leaderboard', to: '/app/fantasy/leaderboard' },
        { label: 'Groups', to: '/app/fantasy/groups' },
      ].map(({ label, to }) => (
        <button
          key={to}
          onClick={() => navigate(to)}
          className="w-full flex items-center justify-between px-4 py-3.5 mb-2 text-left match-row-hover"
          style={{ background: '#111812', borderRadius: 8, border: '1px solid #243028' }}
        >
          <span className="text-[13px] font-medium text-text-1">{label}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="text-text-3">
            <path d="M5 3.5l3.5 3.5L5 10.5" />
          </svg>
        </button>
      ))}

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center px-4 py-3 mt-4 text-[13px] font-medium text-live transition-opacity hover:opacity-80"
        style={{ background: 'rgba(239,68,68,0.07)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.18)' }}
      >
        Sign out
      </button>
    </div>
  );
}
