import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

// ─── Shared admin nav config ──────────────────────────────────────────────────

export const ADMIN_SECTIONS: { to: string; label: string; icon: string; exact?: boolean }[] = [
  { to: '/admin',               label: 'Dashboard',     icon: 'grid',    exact: true },
  { to: '/admin/organizations', label: 'Organizations', icon: 'building'             },
  { to: '/admin/competitions',  label: 'Competitions',  icon: 'trophy'               },
  { to: '/admin/seasons',       label: 'Seasons',       icon: 'calendar'             },
  { to: '/admin/stages',        label: 'Stages',        icon: 'layers'               },
  { to: '/admin/teams',         label: 'Teams',         icon: 'shield'               },
  { to: '/admin/players',       label: 'Players',       icon: 'user'                 },
  { to: '/admin/matches',       label: 'Matches',       icon: 'flag'                 },
  { to: '/admin/scouts',        label: 'Scouts',        icon: 'eye'                  },
];

// ─── Shared icon set ──────────────────────────────────────────────────────────

export function AdminIcon({ name, size = 14 }: { name: string; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'grid':     return <svg {...p}><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>;
    case 'building': return <svg {...p}><rect x="2" y="3" width="12" height="12" rx="1"/><path d="M6 15V9h4v6M5 6h1M10 6h1M5 9h1M10 9h1"/></svg>;
    case 'trophy':   return <svg {...p}><path d="M8 11c-3 0-5-2-5-5V3h10v3c0 3-2 5-5 5z"/><path d="M3 5H1M13 5h2M8 11v3M5 14h6"/></svg>;
    case 'calendar': return <svg {...p}><rect x="2" y="3" width="12" height="12" rx="1"/><path d="M2 7h12M6 1v4M10 1v4"/></svg>;
    case 'layers':   return <svg {...p}><path d="M8 1L1 5l7 4 7-4-7-4zM1 10l7 4 7-4M1 7.5l7 4 7-4"/></svg>;
    case 'shield':   return <svg {...p}><path d="M8 1L2 4v5c0 3.5 2.5 5.5 6 6 3.5-.5 6-2.5 6-6V4L8 1z"/></svg>;
    case 'user':     return <svg {...p}><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5"/></svg>;
    case 'flag':     return <svg {...p}><path d="M3 1v14M3 2h9l-2 4 2 4H3"/></svg>;
    case 'eye':      return <svg {...p}><ellipse cx="8" cy="8" rx="6" ry="4"/><circle cx="8" cy="8" r="2"/></svg>;
    case 'plus':     return <svg {...p}><path d="M8 3v10M3 8h10"/></svg>;
    case 'chevron':  return <svg {...p}><path d="M6 4l4 4-4 4"/></svg>;
    case 'x':        return <svg {...p}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case 'check':    return <svg {...p}><path d="M2 8l4 4 8-6"/></svg>;
    case 'alert':    return <svg {...p}><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 10.5v.5"/></svg>;
    default:         return <svg {...p}/>;
  }
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

function AdminSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-52 flex-shrink-0">
      <div className="sticky top-20">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-3 mb-4">Admin Panel</p>
        <nav className="flex flex-col gap-0.5">
          {ADMIN_SECTIONS.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                  isActive ? 'text-text-1 bg-surface-2' : 'text-text-3 hover:text-text-2 hover:bg-surface-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span style={{ color: isActive ? '#22C55E' : undefined }}>
                    <AdminIcon name={icon} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}

// ─── Mobile section dropdown ──────────────────────────────────────────────────

function AdminMobileNav() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const current = ADMIN_SECTIONS.find(s =>
    s.exact ? loc.pathname === s.to : loc.pathname.startsWith(s.to) && s.to !== '/admin'
  ) ?? ADMIN_SECTIONS[0];

  return (
    <div className="lg:hidden relative mb-5" style={{ zIndex: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-medium text-text-1"
        style={{ background: '#111812', border: '1px solid #243028' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-athlon"><AdminIcon name={current.icon} /></span>
          {current.label}
        </div>
        <span className={`text-text-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
          <AdminIcon name="chevron" />
        </span>
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-xl overflow-hidden"
          style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
        >
          {ADMIN_SECTIONS.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to} to={to} end={exact}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium border-b last:border-0 transition-colors ${
                  isActive ? 'text-athlon bg-surface-2' : 'text-text-2 hover:bg-surface-1'
                }`
              }
              style={{ borderBottomColor: 'rgba(36,48,40,0.5)' }}
            >
              <AdminIcon name={icon} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Layout wrapper ───────────────────────────────────────────────────────────

type Props = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

export default function AdminLayout({ title, children, action }: Props) {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center font-mono text-[9px] font-bold tracking-[0.16em] px-2 py-0.5 rounded"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              ADMIN
            </span>
            {user?.display_name && (
              <span className="text-[11px] font-mono text-text-3">{user.display_name}</span>
            )}
          </div>
          <h1 className="font-condensed font-black text-[28px] sm:text-[32px] text-text-1 tracking-tight leading-none uppercase">
            {title}
          </h1>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {/* Body */}
      <div className="flex gap-8">
        <AdminSidebar />
        <div className="flex-1 min-w-0">
          <AdminMobileNav />
          {children}
        </div>
      </div>
    </div>
  );
}
