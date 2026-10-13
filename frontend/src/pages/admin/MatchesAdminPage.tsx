import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { Match, MatchStatus } from '../../lib/types';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompRef  { id: number; name: string; }
interface TeamRef  { id: number; name: string; short_name?: string; }
interface StageRef { id: number; name: string; number?: number | null; }
interface SeasonRef { id: number; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'results' in (data as object))
    return ((data as { results: T[] }).results) ?? [];
  return [];
}

function fmtError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const d = (err as { data: Record<string, unknown> }).data;
    if (typeof d['detail'] === 'string') return d['detail'];
    const parts: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
      else if (typeof v === 'string') parts.push(v);
    }
    if (parts.length) return parts.join(' · ');
  }
  return err instanceof Error ? err.message : 'An error occurred';
}

const IC = 'w-full px-3 py-2.5 rounded-lg text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors';
const IS = { background: '#0A0F0C', border: '1px solid #243028' };
const LC = 'block text-[11px] font-mono text-text-3 mb-1.5 tracking-wide';
const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#22C55E60');
const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#243028');

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  LIVE:             { label: 'LIVE', color: '#EF4444', bg: 'rgba(239,68,68,0.1)'    },
  HALFTIME:         { label: 'HT',   color: '#FBBF24', bg: 'rgba(251,191,36,0.1)'   },
  SCHEDULED:        { label: 'SCHED',color: '#7A9E80', bg: 'rgba(34,197,94,0.06)'   },
  FINISHED:         { label: 'FT',   color: '#40604A', bg: 'rgba(34,197,94,0.05)'   },
  POSTPONED:        { label: 'PST',  color: '#7A9E80', bg: '#111812'                 },
  CANCELLED:        { label: 'CAN',  color: '#EF4444', bg: 'rgba(239,68,68,0.06)'   },
};

function StatusPill({ status }: { status: MatchStatus }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#7A9E80', bg: '#111812' };
  return (
    <span className="inline-flex items-center font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}25` }}>
      {c.label}
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (m: Match) => void;
}) {
  const [comps,     setComps]     = useState<CompRef[]>([]);
  const [teams,     setTeams]     = useState<TeamRef[]>([]);
  const [seasons,   setSeasons]   = useState<SeasonRef[]>([]);
  const [stages,    setStages]    = useState<StageRef[]>([]);

  const [compId,    setCompId]    = useState('');
  const [homeId,    setHomeId]    = useState('');
  const [awayId,    setAwayId]    = useState('');
  const [seasonId,  setSeasonId]  = useState('');
  const [stageId,   setStageId]   = useState('');
  const [kickoffAt, setKickoffAt] = useState('');

  const [loading,   setLoading]   = useState(false);
  const [fetching,  setFetching]  = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    Promise.allSettled([
      api.get<unknown>(API_PATHS.competitions.list),
      api.get<unknown>(API_PATHS.teams.list),
    ]).then(([cr, tr]) => {
      if (cr.status === 'fulfilled') setComps(unwrap<CompRef>(cr.value));
      if (tr.status === 'fulfilled') setTeams(unwrap<TeamRef>(tr.value));
    }).finally(() => setFetching(false));
  }, []);

  // Load seasons when competition changes
  useEffect(() => {
    setSeasonId(''); setStageId(''); setSeasons([]); setStages([]);
    if (!compId) return;
    api.get<unknown>(API_PATHS.seasons.list(Number(compId)))
      .then(d => setSeasons(unwrap<SeasonRef>(d)));
  }, [compId]);

  // Load stages when season changes
  useEffect(() => {
    setStageId(''); setStages([]);
    if (!seasonId) return;
    api.get<unknown>(API_PATHS.stages.list(Number(seasonId)))
      .then(d => setStages(unwrap<StageRef>(d)));
  }, [seasonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compId)  { setError('Competition is required'); return; }
    if (!homeId)  { setError('Home team is required'); return; }
    if (!awayId)  { setError('Away team is required'); return; }
    if (homeId === awayId) { setError('Home and away teams must be different'); return; }
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        competition_id: Number(compId),
        home_team_id:   Number(homeId),
        away_team_id:   Number(awayId),
      };
      if (stageId)   body.stage_id   = Number(stageId);
      if (kickoffAt) body.kickoff_at = new Date(kickoffAt).toISOString();
      const match = await api.post<Match>(API_PATHS.matches.list, body);
      onCreated(match);
    } catch (err) { setError(fmtError(err)); }
    finally { setLoading(false); }
  };

  const teamOptions = teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.short_name ? ` (${t.short_name})` : ''}</option>);

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 overflow-y-auto py-8"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">New Match</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {fetching ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: '#0A0F0C', border: '1px solid #243028' }} />
            ))}</div>
          ) : (
            <>
              <div>
                <label className={LC}>Competition *</label>
                <select ref={ref} value={compId} onChange={e => setCompId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                  <option value="">— Select competition —</option>
                  {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LC}>Home Team *</label>
                  <select value={homeId} onChange={e => setHomeId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                    <option value="">— Home —</option>
                    {teamOptions}
                  </select>
                </div>
                <div>
                  <label className={LC}>Away Team *</label>
                  <select value={awayId} onChange={e => setAwayId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                    <option value="">— Away —</option>
                    {teamOptions}
                  </select>
                </div>
              </div>
              {seasons.length > 0 && (
                <div>
                  <label className={LC}>Season</label>
                  <select value={seasonId} onChange={e => setSeasonId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                    <option value="">— None —</option>
                    {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {stages.length > 0 && (
                <div>
                  <label className={LC}>Stage (optional)</label>
                  <select value={stageId} onChange={e => setStageId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                    <option value="">— None —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={LC}>Kickoff (optional)</label>
                <input type="datetime-local" value={kickoffAt} onChange={e => setKickoffAt(e.target.value)}
                  className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
              </div>
            </>
          )}
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }}><AdminIcon name="alert" size={12} /></span>
              <p className="text-[12px] text-red-400 leading-snug">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text-1"
              style={{ border: '1px solid #243028' }}>Cancel</button>
            <button type="submit" disabled={loading || fetching}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Creating…' : 'Create Match'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────

const LIVE_STATUSES = new Set(['LIVE', 'HALFTIME']);

function MatchRow({ match, onScoutLink }: { match: Match; onScoutLink: (id: number) => void }) {
  const score = match.home_score != null && match.away_score != null
    ? `${match.home_score}–${match.away_score}` : 'vs';
  const kickoff = match.kickoff_at
    ? new Date(match.kickoff_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const hasStarted = match.status !== 'SCHEDULED' && match.status !== 'POSTPONED' && match.status !== 'CANCELLED';

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0"
      style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
      <StatusPill status={match.status} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-1 truncate">
          <span>{match.home_team.name}</span>
          <span className="font-mono text-[11px] text-text-3 mx-1.5">{score}</span>
          <span>{match.away_team.name}</span>
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {match.competition?.name && (
            <span className="text-[10px] font-mono text-text-3">{match.competition.name}</span>
          )}
          {match.stage?.name && (
            <span className="text-[10px] font-mono text-text-3">· {match.stage.name}</span>
          )}
          {kickoff && <span className="text-[10px] font-mono text-text-3">· {kickoff}</span>}
          {match.minute != null && LIVE_STATUSES.has(match.status) && (
            <span className="font-mono text-[10px]" style={{ color: '#EF4444' }}>{match.minute}'</span>
          )}
        </div>
      </div>
      {hasStarted && (
        <button onClick={() => onScoutLink(match.id)}
          className="flex items-center gap-1.5 text-[10px] font-mono text-athlon hover:opacity-80 transition-opacity flex-shrink-0">
          <AdminIcon name="eye" size={11} /> Scout
        </button>
      )}
    </div>
  );
}

// ─── Status filter tabs ───────────────────────────────────────────────────────

const STATUS_FILTERS = ['ALL', 'LIVE', 'SCHEDULED', 'FINISHED', 'POSTPONED'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchesAdminPage() {
  const navigate = useNavigate();
  const [matches,    setMatches]    = useState<Match[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    api.get<unknown>(API_PATHS.matches.list)
      .then(d => setMatches(unwrap<Match>(d)))
      .catch(() => setError('Failed to load matches'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = matches.filter(m => {
    if (search && !m.home_team.name.toLowerCase().includes(search.toLowerCase()) &&
      !m.away_team.name.toLowerCase().includes(search.toLowerCase()) &&
      !(m.competition?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'LIVE') {
        if (!LIVE_STATUSES.has(m.status)) return false;
      } else if (m.status !== statusFilter) return false;
    }
    return true;
  });

  // Sort: live first, then scheduled, then finished, postponed, cancelled
  const sorted = [...filtered].sort((a, b) => {
    const order: Record<string, number> = { LIVE: 0, HALFTIME: 0, SCHEDULED: 1, FINISHED: 2, POSTPONED: 3, CANCELLED: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  const createBtn = (
    <button onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
      style={{ background: '#22C55E', color: '#0A0F0C' }}>
      <AdminIcon name="plus" size={13} /> New Match
    </button>
  );

  return (
    <AdminLayout title="Matches" action={createBtn}>
      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by team or competition…"
          className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
          style={{ background: '#111812', border: '1px solid #243028' }} />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors"
            style={statusFilter === s
              ? { background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
              : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
            {s}
          </button>
        ))}
      </div>

      {!loading && !error && (
        <p className="text-[10px] font-mono text-text-3 mb-3">
          {sorted.length === matches.length ? `${matches.length} match${matches.length !== 1 ? 'es' : ''}` : `${sorted.length} of ${matches.length}`}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
              style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
              <div className="w-10 h-5 rounded bg-surface-3 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-3 rounded" style={{ width: '60%' }} />
                <div className="h-2.5 bg-surface-3 rounded" style={{ width: '35%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span style={{ color: '#EF4444' }}><AdminIcon name="alert" size={28} /></span>
          <p className="text-[13px] text-text-3">{error}</p>
          <button onClick={load} className="px-4 py-2 text-[12px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: '#111812', border: '1px solid #243028', color: '#40604A' }}>
            <AdminIcon name="flag" size={22} />
          </div>
          <p className="text-[14px] font-medium text-text-2">
            {search || statusFilter !== 'ALL' ? 'No matches match your filters' : 'No matches yet'}
          </p>
          {(search || statusFilter !== 'ALL') && (
            <button onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
              className="text-[12px] font-mono text-athlon hover:opacity-80">Clear filters</button>
          )}
          {!search && statusFilter === 'ALL' && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              <AdminIcon name="plus" size={13} /> New Match
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {sorted.map(m => (
            <MatchRow key={m.id} match={m} onScoutLink={id => navigate(`/scout/matches/${id}`)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)}
          onCreated={match => { setMatches(prev => [match, ...prev]); setShowCreate(false); }} />
      )}
    </AdminLayout>
  );
}
