import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

const NAV_LINKS = [
  { to: '/',            label: 'Home',     exact: true },
  { to: '/fixtures',    label: 'Fixtures' },
  { to: '/standings',   label: 'Table' },
  { to: '/teams',       label: 'Teams' },
  { to: '/app/fantasy', label: 'Fantasy' },
];

function AthlonMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="3" fill="#22C55E" />
      <path d="M16 4.5L8.5 27.5H12L14.5 19H17.5L20 27.5H23.5L16 4.5Z" fill="#0A0F0C" />
      <path d="M16 9L14.5 19H17.5Z" fill="#22C55E" />
    </svg>
  );
}

export default function Nav() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/auth/login');
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(10,15,12,0.98)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(36,48,40,0.9)',
        borderRadius: 0,
      }}
    >
      <nav className="max-w-5xl mx-auto flex items-center h-14 px-4 gap-3">
        {/* Logo */}
        <NavLink to="/" aria-label="Athlon home" className="flex items-center gap-2 flex-shrink-0">
          <AthlonMark size={26} />
          <span
            className="font-condensed font-black text-text-1 hidden sm:inline"
            style={{ fontSize: 16, letterSpacing: '0.06em' }}
          >
            ATHLON
          </span>
        </NavLink>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-0 flex-1 ml-1">
          {NAV_LINKS.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `relative px-3.5 py-2 text-[13px] font-medium transition-colors duration-100 ${
                  isActive ? 'text-text-1' : 'text-text-3 hover:text-text-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-3.5 right-3.5 h-[2px]"
                      style={{ background: '#22C55E' }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right: auth */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Desktop */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated ? (
              <div className="relative group/avatar">
                <button
                  onClick={() => navigate('/app/fantasy/profile')}
                  className="flex items-center gap-2 px-2 py-1.5 border border-border rounded-md hover:border-border-hi transition-all duration-100"
                  aria-label="Open account profile"
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center font-condensed font-black text-[11px] flex-shrink-0"
                    style={{ background: '#22C55E', color: '#0A0F0C' }}
                  >
                    {user?.display_name?.charAt(0).toUpperCase() ?? 'U'}
                  </span>
                  <span className="text-[12px] font-medium text-text-2 max-w-[80px] truncate">{user?.display_name?.split(' ')[0]}</span>
                  <svg className="w-3 h-3 text-text-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" d="M3 5l3 3 3-3" />
                  </svg>
                </button>
                <div
                  className="absolute right-0 top-[calc(100%+6px)] w-48 border border-border rounded-lg overflow-hidden z-50 opacity-0 pointer-events-none group-hover/avatar:opacity-100 group-hover/avatar:pointer-events-auto transition-all duration-150"
                  style={{ background: '#111812', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}
                >
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-[12px] font-semibold text-text-1 truncate">{user?.display_name}</p>
                    <p className="text-[10px] font-mono text-text-3 truncate mt-0.5">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    {user?.role === 'ADMIN' && (
                      <NavLink to="/admin" className="flex items-center px-4 py-2.5 text-[12px] text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">
                        Admin panel
                      </NavLink>
                    )}
                    {(user?.role === 'SCOUT' || user?.role === 'ADMIN') && (
                      <NavLink to="/scout" className="flex items-center px-4 py-2.5 text-[12px] text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">
                        Scout hub
                      </NavLink>
                    )}
                    <NavLink to="/app/fantasy/team" className="flex items-center px-4 py-2.5 text-[12px] text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">
                      My Fantasy Team
                    </NavLink>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left flex items-center px-4 py-2.5 text-[12px] text-live hover:bg-surface-2 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <NavLink
                to="/auth/login"
                className="flex items-center px-4 py-1.5 text-[12px] font-condensed font-bold tracking-[0.08em] transition-all hover:opacity-85"
                style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
              >
                Sign in
              </NavLink>
            )}
          </div>

          {/* Mobile: avatar or sign-in */}
          <div className="md:hidden flex items-center">
            {isAuthenticated ? (
              <NavLink
                to="/app/fantasy/profile"
                className="w-8 h-8 flex items-center justify-center rounded-md"
                style={{ background: '#22C55E', color: '#0A0F0C' }}
                aria-label="My account"
              >
                <span className="font-condensed font-black text-[13px]">
                  {user?.display_name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
              </NavLink>
            ) : (
              <NavLink
                to="/auth/login"
                className="flex items-center px-3.5 py-1.5 text-[11px] font-condensed font-bold tracking-[0.08em]"
                style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
              >
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
