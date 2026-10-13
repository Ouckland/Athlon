import { Outlet, NavLink } from 'react-router';

function AthlonMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="2" fill="#22C55E" />
      <path d="M16 4.5L8.5 27.5H12L14.5 19H17.5L20 27.5H23.5L16 4.5Z" fill="#0A0F0C" />
      <path d="M16 9L14.5 19H17.5Z" fill="#22C55E" />
    </svg>
  );
}

// Brief stat row shown on the brand panel
const STATS = [
  { value: '12,000+', label: 'Leagues tracked' },
  { value: '1M+',     label: 'Fantasy entries'  },
  { value: 'Real-time', label: 'Live scores'    },
];

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex" style={{ background: '#0A0F0C' }}>

      {/* ── Left panel: brand (desktop only) ─────────────────────── */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden flex-shrink-0"
        style={{
          width: 440,
          borderRight: '1px solid #1A1C24',
        }}
      >
        {/* Stadium photo — atmospheric, very dark */}
        <img
          src="https://images.unsplash.com/photo-1679391029864-d46f366a456b?w=880&h=1200&fit=crop&auto=format"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          style={{ opacity: 0.28, objectPosition: 'center 30%' }}
        />
        {/* Multi-stop gradient: top=dark, middle=lighter, bottom=dark */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(9,9,14,0.65) 0%, rgba(9,9,14,0.25) 40%, rgba(9,9,14,0.75) 100%)',
          }}
        />

        <div className="relative flex flex-col h-full px-10 py-10 justify-between">
          {/* Top: Wordmark */}
          <NavLink to="/" className="flex items-center gap-2.5 w-fit" aria-label="Athlon home">
            <AthlonMark size={30} />
            <span
              className="font-condensed font-black text-text-1"
              style={{ fontSize: 17, letterSpacing: '0.05em' }}
            >
              ATHLON
            </span>
          </NavLink>

          {/* Bottom: Tagline + stats */}
          <div>
            <p
              className="font-condensed font-black text-text-1 leading-[1.05] mb-5"
              style={{ fontSize: 42, letterSpacing: '-0.01em' }}
            >
              The platform<br />built for<br />football.
            </p>
            <p className="text-[13px] text-text-2 leading-relaxed mb-8" style={{ maxWidth: 300 }}>
              Live scores, fantasy leagues, and match intelligence — for fans who take the game seriously.
            </p>

            {/* Stats row */}
            <div className="flex items-start gap-8 border-t pt-6" style={{ borderColor: 'rgba(35,37,46,0.8)' }}>
              {STATS.map(({ value, label }) => (
                <div key={label}>
                  <p className="font-condensed font-black text-text-1 leading-none" style={{ fontSize: 22 }}>{value}</p>
                  <p className="text-[10px] font-mono text-text-3 mt-1 tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: form ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header — flat, clean, logo only */}
        <header
          className="lg:hidden flex items-center px-5 h-12 flex-shrink-0"
          style={{ borderBottom: '1px solid #243028' }}
        >
          <NavLink to="/" className="flex items-center gap-2" aria-label="Athlon home">
            <AthlonMark size={24} />
            <span className="font-condensed font-black text-text-1" style={{ fontSize: 15, letterSpacing: '0.06em' }}>
              ATHLON
            </span>
          </NavLink>
        </header>

        {/* Form — centered vertically and horizontally */}
        <main className="flex-1 flex items-center justify-center px-5 py-8">
          <div className="w-full max-w-sm">
            <Outlet />
            <div className="mt-8 flex justify-center">
              <NavLink
                to="/"
                className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M8 2L4 6l4 4" />
                </svg>
                Back to home
              </NavLink>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
