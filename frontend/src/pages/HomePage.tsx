import { useState, useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router';
import type { Match } from '../lib/types';
import { usePublicMatches } from '../hooks/useMatches';
import TeamCrest from '../components/TeamCrest';
import CompetitionBadge from '../components/CompetitionBadge';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Football pitch animated SVG background ───────────────────────────────────

function PitchBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Grass gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #0D1F12 0%, #0A1510 60%, #0A0F0C 100%)',
        }}
      />
      {/* Animated pitch lines SVG */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07]"
        viewBox="0 0 390 280"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer boundary */}
        <rect x="20" y="20" width="350" height="240" stroke="#22C55E" strokeWidth="1.5" />
        {/* Centre line */}
        <line x1="195" y1="20" x2="195" y2="260" stroke="#22C55E" strokeWidth="1.2" />
        {/* Centre circle */}
        <circle cx="195" cy="140" r="40" stroke="#22C55E" strokeWidth="1.2" />
        {/* Centre spot */}
        <circle cx="195" cy="140" r="2" fill="#22C55E" />
        {/* Left penalty area */}
        <rect x="20" y="85" width="60" height="110" stroke="#22C55E" strokeWidth="1" />
        {/* Left goal area */}
        <rect x="20" y="112" width="24" height="56" stroke="#22C55E" strokeWidth="1" />
        {/* Left penalty spot */}
        <circle cx="56" cy="140" r="1.5" fill="#22C55E" />
        {/* Right penalty area */}
        <rect x="310" y="85" width="60" height="110" stroke="#22C55E" strokeWidth="1" />
        {/* Right goal area */}
        <rect x="346" y="112" width="24" height="56" stroke="#22C55E" strokeWidth="1" />
        {/* Right penalty spot */}
        <circle cx="334" cy="140" r="1.5" fill="#22C55E" />
        {/* Corner arcs */}
        <path d="M20 28 A8 8 0 0 1 28 20" stroke="#22C55E" strokeWidth="1" />
        <path d="M362 20 A8 8 0 0 1 370 28" stroke="#22C55E" strokeWidth="1" />
        <path d="M370 252 A8 8 0 0 1 362 260" stroke="#22C55E" strokeWidth="1" />
        <path d="M28 260 A8 8 0 0 1 20 252" stroke="#22C55E" strokeWidth="1" />
        {/* Penalty arcs */}
        <path d="M80 115 A42 42 0 0 1 80 165" stroke="#22C55E" strokeWidth="1" />
        <path d="M310 165 A42 42 0 0 1 310 115" stroke="#22C55E" strokeWidth="1" />
      </svg>
      {/* Green ambient glow at top */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl pointer-events-none"
        style={{ background: 'rgba(34,197,94,0.08)' }}
      />
    </div>
  );
}

// ─── Animated football icon ───────────────────────────────────────────────────

function FootballIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className="animate-ball-float"
      aria-hidden
    >
      <circle cx="20" cy="20" r="19" fill="#162019" stroke="#22C55E" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="8" fill="#243028" stroke="#22C55E" strokeWidth="0.8" />
      <line x1="20" y1="1" x2="20" y2="12" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="20" y1="28" x2="20" y2="39" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="1" y1="20" x2="12" y2="20" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="28" y1="20" x2="39" y2="20" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="5" y1="7" x2="14" y2="14" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="26" y1="26" x2="35" y2="33" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="35" y1="7" x2="26" y2="14" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="14" y1="26" x2="5" y2="33" stroke="#22C55E" strokeWidth="0.8" strokeDasharray="2 2" />
    </svg>
  );
}

// ─── Live dot ──────────────────────────────────────────────────────────────────

function LiveDot({ size = 7 }: { size?: number }) {
  return (
    <span className="relative flex flex-shrink-0" style={{ width: size + 4, height: size + 4 }}>
      <span className="absolute inset-0 rounded-full animate-live-ring" style={{ background: '#EF4444', opacity: 0.5 }} />
      <span className="relative m-auto rounded-full animate-live-pulse" style={{ width: size - 1, height: size - 1, background: '#EF4444' }} />
    </span>
  );
}

// ─── Match status ──────────────────────────────────────────────────────────────

function MatchStatus({ match }: { match: Match }) {
  switch (match.status) {
    case 'LIVE':
      return (
        <div className="flex flex-col items-center gap-0.5 w-12 flex-shrink-0">
          <LiveDot size={6} />
          <span className="text-[10px] font-mono font-medium text-live leading-none">
            {`${match.minute}'`}
          </span>
        </div>
      );
    case 'HALFTIME':
      return (
        <div className="w-12 flex-shrink-0 flex items-center justify-center">
          <span className="text-[10px] font-condensed font-bold tracking-wider px-1.5 py-0.5" style={{ color: '#FBBF24', background: 'rgba(251,191,36,0.1)', borderRadius: 3 }}>HT</span>
        </div>
      );
    case 'FINISHED':
      return <div className="w-12 flex-shrink-0 flex items-center justify-center"><span className="text-[10px] font-mono text-text-3">FT</span></div>;
    case 'POSTPONED':
      return <div className="w-12 flex-shrink-0 flex items-center justify-center"><span className="text-[10px] font-mono text-text-3 italic">PPD</span></div>;
    default:
      return <div className="w-12 flex-shrink-0 flex items-center justify-center"><span className="text-[11px] font-mono font-medium text-text-2">{fmtTime(match.kickoff_at)}</span></div>;
  }
}

// ─── Match score ──────────────────────────────────────────────────────────────

function MatchScore({ match }: { match: Match }) {
  const isFinished = match.status === 'FINISHED';
  const hasScore   = match.home_score != null && match.away_score != null;
  const homeWin    = isFinished && match.home_score! > match.away_score!;
  const awayWin    = isFinished && match.away_score! > match.home_score!;

  if (!hasScore) {
    return (
      <div className="w-14 flex-shrink-0 flex items-center justify-center">
        <span className="text-[10px] font-condensed font-semibold text-text-3 tracking-widest">vs</span>
      </div>
    );
  }

  return (
    <div className="w-14 flex-shrink-0 flex items-center justify-center gap-0.5">
      <span className="font-condensed font-black tabular-nums leading-none" style={{ fontSize: 18, letterSpacing: '-0.02em', color: awayWin && isFinished ? '#4B6A54' : '#E2F2E8' }}>{match.home_score}</span>
      <span className="font-condensed font-light text-sm leading-none mx-0.5" style={{ color: '#344A38' }}>-</span>
      <span className="font-condensed font-black tabular-nums leading-none" style={{ fontSize: 18, letterSpacing: '-0.02em', color: homeWin && isFinished ? '#4B6A54' : '#E2F2E8' }}>{match.away_score}</span>
    </div>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchRow({ match, onClick }: { match: Match; onClick: () => void }) {
  const isLive = match.status === 'LIVE';
  const isHT   = match.status === 'HALFTIME';
  const isFinished = match.status === 'FINISHED';
  const homeWin = isFinished && match.home_score! > match.away_score!;
  const awayWin = isFinished && match.away_score! > match.home_score!;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center border-b border-border/40 last:border-0 match-row-hover active:opacity-70 transition-opacity duration-100"
      style={{
        height: 52,
        paddingLeft: 12,
        paddingRight: 14,
        background: 'transparent',
        borderLeft: isLive ? '2px solid #EF4444' : isHT ? '2px solid #FBBF24' : '2px solid transparent',
      }}
    >
      <MatchStatus match={match} />
      {/* Home */}
      <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
        <TeamCrest team={match.home_team} size="xs" />
        <span className="text-[13px] truncate text-left" style={{ fontWeight: homeWin ? 600 : 500, color: isFinished && awayWin ? '#4B6A54' : '#E2F2E8' }}>
          {match.home_team.short_name}
        </span>
      </div>
      <MatchScore match={match} />
      {/* Away */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="text-[13px] truncate text-right" style={{ fontWeight: awayWin ? 600 : 500, color: isFinished && homeWin ? '#4B6A54' : '#E2F2E8' }}>
          {match.away_team.short_name}
        </span>
        <TeamCrest team={match.away_team} size="xs" />
      </div>
    </button>
  );
}

// ─── Competition section ──────────────────────────────────────────────────────

function CompSection({ matches, onMatchClick }: { matches: Match[]; onMatchClick: (id: number) => void }) {
  const comp = matches[0].competition;
  const liveCount = matches.filter(m => m.status === 'LIVE').length;

  return (
    <div style={{ background: '#111812', borderRadius: 8, border: '1px solid #243028', overflow: 'hidden' }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: '#162019', borderBottom: '1px solid #243028' }}>
        <CompetitionBadge competition={comp} />
        <span className="flex-1 text-[12px] font-medium text-text-1 truncate">{comp.short_name}</span>
        {liveCount > 0 && (
          <span className="flex items-center gap-1.5">
            <LiveDot size={5} />
            <span className="text-[10px] font-mono text-live">{liveCount} live</span>
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="text-text-3 flex-shrink-0">
          <path d="M5 3.5l3.5 3.5L5 10.5" />
        </svg>
      </div>
      <div>{matches.map(m => <MatchRow key={m.id} match={m} onClick={() => onMatchClick(m.id)} />)}</div>
    </div>
  );
}

// ─── Live card (horizontal strip) ─────────────────────────────────────────────

function LiveCard({ match, onClick }: { match: Match; onClick: () => void }) {
  const minuteDisplay = `${match.minute}'`;
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex flex-col overflow-hidden active:opacity-70 transition-opacity"
      style={{ width: 176, background: '#111812', border: '1px solid #243028', borderTop: '2px solid #EF4444', borderRadius: 8 }}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <CompetitionBadge competition={match.competition} />
        <div className="flex items-center gap-1.5">
          <LiveDot size={5} />
          <span className="text-[10px] font-mono text-live font-medium">{minuteDisplay}</span>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1.5 gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <TeamCrest team={match.home_team} size="xs" />
          <span className="text-[12px] font-medium text-text-1 truncate">{match.home_team.abbreviation}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="font-condensed font-black text-xl text-text-1 tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{match.home_score}</span>
          <span className="font-condensed font-light text-sm leading-none" style={{ color: '#344A38' }}>-</span>
          <span className="font-condensed font-black text-xl text-text-1 tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{match.away_score}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-[12px] font-medium text-text-1 truncate text-right">{match.away_team.abbreviation}</span>
          <TeamCrest team={match.away_team} size="xs" />
        </div>
      </div>
    </button>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ match, onClick }: { match: Match; onClick: () => void }) {
  const home = match.home_score ?? 0;
  const away = match.away_score ?? 0;
  const homeWin = home > away;
  const awayWin = away > home;
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 overflow-hidden active:opacity-70 transition-opacity"
      style={{ width: 160, background: '#111812', border: '1px solid #243028', borderRadius: 8 }}
    >
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <CompetitionBadge competition={match.competition} />
        <span className="text-[9px] font-mono text-text-3">FT</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamCrest team={match.home_team} size="xs" />
          <span className={`text-[12px] truncate ${homeWin ? 'font-semibold text-text-1' : 'text-text-2'}`}>{match.home_team.abbreviation}</span>
        </div>
        <span className={`font-condensed font-black text-xl tabular-nums leading-none flex-shrink-0 ${homeWin ? 'text-text-1' : 'text-text-3'}`}>{home}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2" style={{ borderTop: '1px solid rgba(36,48,40,0.5)' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamCrest team={match.away_team} size="xs" />
          <span className={`text-[12px] truncate ${awayWin ? 'font-semibold text-text-1' : 'text-text-2'}`}>{match.away_team.abbreviation}</span>
        </div>
        <span className={`font-condensed font-black text-xl tabular-nums leading-none flex-shrink-0 ${awayWin ? 'text-text-1' : 'text-text-3'}`}>{away}</span>
      </div>
    </button>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ title, action }: { title: string; action?: { label: string; to: string } }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h2 className="font-condensed font-bold text-[12px] text-text-3 tracking-[0.1em] uppercase">{title}</h2>
      {action && (
        <NavLink to={action.to} className="text-[11px] font-mono text-text-3 hover:text-athlon transition-colors">
          See all →
        </NavLink>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('ALL');

  const { matches, isLoading, error } = usePublicMatches({});
  const today = new Date();
  const todayMatches = matches.filter(m => new Date(m.kickoff_at).toDateString() === today.toDateString());
  const liveMatches = matches.filter(m => m.status === 'LIVE');
  const recentResults = matches
    .filter(m => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime())
    .slice(0, 5);
  const upcomingFixtures = matches
    .filter(m => m.status === 'SCHEDULED' && new Date(m.kickoff_at) >= today)
    .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())
    .slice(0, 5);
  const liveCount = liveMatches.length;

  const filtered = useMemo(() => {
    if (activeFilter === 'ALL') return todayMatches;
    if (activeFilter === 'LIVE') return todayMatches.filter(m => m.status === 'LIVE' || m.status === 'HALFTIME');
    return todayMatches.filter(m => m.competition.code === activeFilter);
  }, [activeFilter, todayMatches]);

  const grouped: Record<string, Match[]> = useMemo(() => {
    const g: Record<string, Match[]> = {};
    for (const m of filtered) {
      if (!g[m.competition.code]) g[m.competition.code] = [];
      g[m.competition.code].push(m);
    }
    return g;
  }, [filtered]);

  const filters = [
    { key: 'ALL',  label: 'All' },
    { key: 'LIVE', label: liveCount > 0 ? `Live (${liveCount})` : 'Live' },
    { key: 'PL',   label: 'PL' },
    { key: 'UCL',  label: 'UCL' },
    { key: 'LL',   label: 'La Liga' },
  ];

  return (
    <div className="animate-fade-in">

      {/* ─── Hero with pitch animation ─────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 180 }}>
        <PitchBackground />
        <div className="relative z-10 px-4 pt-6 pb-5">
          {/* Day + date */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-condensed font-black text-[28px] text-text-1 leading-none tracking-tight">
                {today.toLocaleDateString('en-GB', { weekday: 'long' })}
              </p>
              <p className="text-[12px] font-mono text-text-3 mt-1">
                {today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 pt-1">
              <FootballIcon size={36} />
              {liveCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5 }}>
                  <LiveDot size={5} />
                  <span className="text-[11px] font-condensed font-bold text-live tracking-wider">{liveCount} LIVE</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ─── Live strip ────────────────────────────────────────── */}
      {liveCount > 0 && (
        <div className="px-4 pt-4 pb-3">
          <SectionLabel title="Live now" action={{ label: 'All fixtures', to: '/fixtures' }} />
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1" style={{ scrollSnapType: 'x mandatory' }}>
            {liveMatches.map(m => (
              <LiveCard key={m.id} match={m} onClick={() => navigate(`/matches/${m.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Filter pills ──────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-3">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className="flex-shrink-0 px-3 py-1.5 text-[11px] font-mono font-medium transition-all duration-100"
            style={{
              borderRadius: 5,
              border: '1px solid',
              background: activeFilter === key ? '#22C55E' : '#111812',
              borderColor: activeFilter === key ? '#22C55E' : '#243028',
              color: activeFilter === key ? '#0A0F0C' : '#7A9E80',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Today's matches ───────────────────────────────────── */}
      <div className="px-4 space-y-3 pb-4">
        <SectionLabel title="Today" />
        {isLoading && <p className="py-8 text-center text-[12px] font-mono text-text-3">Loading matches…</p>}
        {error && !isLoading && <p className="py-8 text-center text-[12px] font-mono text-live">Unable to load matches from the backend.</p>}
        {!isLoading && !error && Object.values(grouped).map(matches => (
          <CompSection key={matches[0].competition.code} matches={matches} onMatchClick={id => navigate(`/matches/${id}`)} />
        ))}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex items-center justify-center py-10" style={{ background: '#111812', border: '1px solid #243028', borderRadius: 8 }}>
            <p className="text-[13px] font-mono text-text-3">No matches for this filter</p>
          </div>
        )}
      </div>

      {/* ─── Recent results ────────────────────────────────────── */}
      {recentResults.length > 0 && (
        <div className="px-4 pb-4">
          <SectionLabel title="Recent results" action={{ label: 'All results', to: '/fixtures' }} />
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {recentResults.map(m => (
              <ResultCard key={m.id} match={m} onClick={() => navigate(`/matches/${m.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Upcoming ──────────────────────────────────────────── */}
      {upcomingFixtures.length > 0 && (
        <div className="px-4 pb-4">
          <SectionLabel title="Upcoming" action={{ label: 'Full schedule', to: '/fixtures' }} />
          <div style={{ background: '#111812', border: '1px solid #243028', borderRadius: 8, overflow: 'hidden' }}>
            {upcomingFixtures.map(match => (
              <button
                key={match.id}
                onClick={() => navigate(`/matches/${match.id}`)}
                className="w-full flex items-center px-3 py-3 border-b border-border/40 last:border-0 match-row-hover gap-2 active:opacity-70"
                style={{ height: 50 }}
              >
                <span className="text-[11px] font-mono text-text-2 w-11 flex-shrink-0">{fmtTime(match.kickoff_at)}</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <TeamCrest team={match.home_team} size="xs" />
                  <span className="text-[12px] font-medium text-text-1 truncate">{match.home_team.short_name}</span>
                </div>
                <span className="text-[10px] font-condensed text-text-3 tracking-widest px-1">vs</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                  <span className="text-[12px] font-medium text-text-1 truncate text-right">{match.away_team.short_name}</span>
                  <TeamCrest team={match.away_team} size="xs" />
                </div>
                <CompetitionBadge competition={match.competition} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Footer ────────────────────────────────────────────── */}
      <footer className="px-4 pb-8 pt-4 border-t border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="3" fill="#22C55E" />
            <path d="M16 4.5L8.5 27.5H12L14.5 19H17.5L20 27.5H23.5L16 4.5Z" fill="#0A0F0C" />
            <path d="M16 9L14.5 19H17.5Z" fill="#22C55E" />
          </svg>
          <span className="font-condensed font-black text-text-1" style={{ fontSize: 14, letterSpacing: '0.06em' }}>ATHLON</span>
        </div>
        <p className="text-[10px] font-mono text-text-3">2025/26 · All rights reserved</p>
      </footer>

    </div>
  );
}
