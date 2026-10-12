import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { Match, MatchStatus } from '../../lib/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusPill({ status, minute }: { status: MatchStatus; minute?: number | null }) {
  if (status === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest"
        style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
        LIVE {minute ? `${minute}'` : ''}
      </span>
    );
  }
  if (status === 'HALFTIME') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest"
      style={{ background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.18)' }}>HT</span>
  );
  if (status === 'SCHEDULED') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest"
      style={{ background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>UPCOMING</span>
  );
  if (status === 'FINISHED') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest"
      style={{ background: 'rgba(34,197,94,0.06)', color: '#40604A', border: '1px solid rgba(34,197,94,0.1)' }}>FT</span>
  );
  return null;
}

// ─── Quick match row ──────────────────────────────────────────────────────────

function MatchRow({ match, onClick }: { match: Match; onClick: () => void }) {
  const score = match.home_score != null && match.away_score != null
    ? `${match.home_score} – ${match.away_score}` : '–';

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left group hover:bg-surface-2 transition-colors border-b last:border-0"
      style={{ borderBottomColor: 'rgba(36,48,40,0.4)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <StatusPill status={match.status} minute={match.minute} />
          {match.stage && (
            <span className="text-[9px] font-mono text-text-3 truncate">
              {match.stage.kind_display}{match.stage.number ? ` ${match.stage.number}` : ''}
            </span>
          )}
        </div>
        <p className="text-[13px] font-medium text-text-1 truncate">
          {match.home_team.name}
          <span className="text-text-3 mx-1.5 font-mono text-[11px]">{score}</span>
          {match.away_team.name}
        </p>
      </div>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        className="text-text-3 group-hover:text-athlon transition-colors flex-shrink-0">
        <path d="M4 2l4 4-4 4" />
      </svg>
    </button>
  );
}

function Section({ title, accent, matches, onMatch }: {
  title: string; accent: string; matches: Match[]; onMatch: (id: number) => void;
}) {
  if (!matches.length) return null;
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">{title}</h2>
        <span className="font-mono text-[10px] text-text-3 opacity-50">({matches.length})</span>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
        {matches.map(m => <MatchRow key={m.id} match={m} onClick={() => onMatch(m.id)} />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScoutDashboard() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get<Match[]>(API_PATHS.matches.list)
      .then(d => setMatches(Array.isArray(d) ? d : []))
      .catch(() => setMatches([]))
      .finally(() => setIsLoading(false));
  }, []);

  const live = matches.filter(m => ['LIVE', 'HALFTIME'].includes(m.status));
  const scheduled = matches.filter(m => m.status === 'SCHEDULED');
  const finished = matches.filter(m => m.status === 'FINISHED').slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <span className="inline-flex items-center px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase font-bold rounded mb-2"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
          Scout Access
        </span>
        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none">Scout Dashboard</h1>
        <p className="text-[11px] font-mono text-text-3 mt-1">Manage matches and record events.</p>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => navigate('/scout/matches')}
          className="flex-1 py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-90 transition-opacity"
          style={{ background: '#22C55E', color: '#0A0F0C' }}>
          All Matches
        </button>
        <button onClick={() => navigate('/scout/matches?create=1')}
          className="flex-1 py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-80 transition-opacity"
          style={{ background: '#111812', color: '#22C55E', border: '1px solid #243028' }}>
          + Create Match
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }} />
          ))}
        </div>
      ) : (
        <>
          <Section title="Live Now" accent="#EF4444" matches={live} onMatch={id => navigate(`/scout/matches/${id}`)} />
          <Section title="Upcoming" accent="#22C55E" matches={scheduled} onMatch={id => navigate(`/scout/matches/${id}`)} />
          <Section title="Recent" accent="#40604A" matches={finished} onMatch={id => navigate(`/scout/matches/${id}`)} />
          {!live.length && !scheduled.length && !finished.length && (
            <div className="py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
              <p className="text-[13px] text-text-3 mb-3">No matches yet</p>
              <button onClick={() => navigate('/scout/matches?create=1')} className="text-[12px] font-mono text-athlon hover:opacity-80">
                Create the first match →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
