import { NavLink } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  {
    to: '/', end: true, label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#22C55E' : 'none'} stroke={active ? '#22C55E' : 'currentColor'} strokeWidth={active ? 0 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {active
          ? <path d="M3 12L12 4l9 8v8a1 1 0 01-1 1h-5v-5h-6v5H4a1 1 0 01-1-1v-8z" />
          : <>
              <path d="M3 12L12 4l9 8" />
              <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </>
        }
      </svg>
    ),
  },
  {
    to: '/fixtures', end: false, label: 'Fixtures',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#22C55E' : 'currentColor'} strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
        {active && <><path d="M7 15h2M12 15h2M7 18.5h2M12 18.5h2" strokeWidth={2} /></>}
        {!active && <><path d="M7 15h2M12 15h2M7 18.5h2M12 18.5h2" strokeWidth={1.4} /></>}
      </svg>
    ),
  },
  {
    to: '/standings', end: false, label: 'Table',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#22C55E' : 'currentColor'} strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 18V11M9 18V7M14 18V13M19 18V4" />
      </svg>
    ),
  },
  {
    to: '/app/fantasy', end: false, label: 'Fantasy',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#22C55E' : 'none'} stroke={active ? '#22C55E' : 'currentColor'} strokeWidth={active ? 0 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
    ),
  },
  {
    to: '/auth/login', end: false, label: 'Account',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#22C55E' : 'currentColor'} strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const { isAuthenticated } = useAuth();
  const navItems = NAV_ITEMS.map((item) =>
    item.label === 'Account'
      ? { ...item, to: isAuthenticated ? '/app/fantasy/profile' : '/auth/login' }
      : item,
  );

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        background: 'rgba(10,15,12,0.98)',
        borderTop: '1px solid #243028',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map(({ to, end, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 relative active:opacity-60 transition-opacity duration-100"
          style={{ height: 60 }}
        >
          {({ isActive }) => (
            <>
              {/* Active pill at top edge */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full"
                  style={{ background: '#22C55E', width: 28 }}
                />
              )}
              <span style={{ color: isActive ? '#22C55E' : '#40604A' }}>
                {icon(isActive)}
              </span>
              <span
                className="text-[9px] font-condensed font-semibold tracking-[0.06em] uppercase"
                style={{ color: isActive ? '#22C55E' : '#40604A' }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
