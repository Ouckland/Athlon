import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { Match, MatchStatus, Competition, ApiTeam, Stage, Season } from '../../lib/types';

// ─── Status labels / colors ───────────────────────────────────────────────────

const STATUS_OPTS: { value: MatchStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'LIVE', label: 'Live' },
  { value: 'HALFTIME', label: 'Half Time' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'POSTPONED', label: 'Postponed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_COLOR: Partial<Record<MatchStatus, string>> = {
  LIVE: '#EF4444',
  HALFTIME: '#FBBF24',
  FINISHED: '#40604A',
  SCHEDULED: '#7A9E80',
  POSTPONED: '#7A9E80',
  CANCELLED: '#7A9E80',
};

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchRow({ match, onClick }: { match: Match; onClick: () => void }) {
  const score = match.home_score != null && match.away_score != null
    ? `${match.home_score} – ${match.away_score}` : 'vs';
  const dot = STATUS_COLOR[match.status] ?? '#7A9E80';

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left group hover:bg-surface-2 transition-colors border-b last:border-0"
      style={{ borderBottomColor: 'rgba(36,48,40,0.4)' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-1 truncate leading-tight">
          {match.home_team.name}
          <span className="text-text-3 mx-2 font-mono text-[11px]">{score}</span>
          {match.away_team.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-text-3">{match.status_display}</span>
          {match.minute != null && <span className="text-[10px] font-mono text-text-3">{match.minute}'</span>}
          {match.competition && <span className="text-[10px] font-mono text-text-3 truncate">· {match.competition.name}</span>}
        </div>
      </div>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        className="text-text-3 group-hover:text-athlon transition-colors flex-shrink-0">
        <path d="M4 2l4 4-4 4" />
      </svg>
    </button>
  );
}

// ─── Create Match Modal ───────────────────────────────────────────────────────

function CreateMatchModal({ onCreated, onClose }: { onCreated: (m: Match) => void; onClose: () => void }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [stageId, setStageId] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Competition[]>(API_PATHS.competitions.list)
      .then(d => setCompetitions(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingComps(false));
  }, []);

  useEffect(() => {
    if (!competitionId) { setSeasons([]); setSeasonId(''); setStages([]); setStageId(''); setTeams([]); setHomeTeamId(''); setAwayTeamId(''); return; }
    setLoadingSeasons(true);
    setLoadingTeams(true);
    setSeasonId(''); setStageId(''); setStages([]);
    Promise.all([
      api.get<Season[]>(API_PATHS.seasons.list(Number(competitionId))),
      api.get<ApiTeam[]>(API_PATHS.competitions.teams(Number(competitionId))),
    ])
      .then(([ss, ts]) => {
        const seasons = Array.isArray(ss) ? ss : [];
        setSeasons(seasons);
        if (seasons.length === 1) setSeasonId(String(seasons[0].id));
        setTeams(Array.isArray(ts) ? ts : []);
      })
      .catch(() => {})
      .finally(() => { setLoadingSeasons(false); setLoadingTeams(false); });
  }, [competitionId]);

  useEffect(() => {
    if (!seasonId) { setStages([]); setStageId(''); return; }
    setLoadingStages(true);
    setStageId('');
    api.get<Stage[]>(API_PATHS.stages.list(Number(seasonId)))
      .then(d => setStages(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingStages(false));
  }, [seasonId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!competitionId || !homeTeamId || !awayTeamId) return;
    if (homeTeamId === awayTeamId) { setError('Home and away team must be different'); return; }
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, string | number> = {
        competition_id: Number(competitionId),
        home_team_id: Number(homeTeamId),
        away_team_id: Number(awayTeamId),
      };
      if (stageId) body['stage_id'] = Number(stageId);
      if (kickoff) body['kickoff_at'] = new Date(kickoff).toISOString();
      const match = await api.post<Match>(API_PATHS.matches.list, body);
      onCreated(match);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(typeof d['detail'] === 'string' ? d['detail'] : `Error ${err.status}`);
      } else {
        setError('Failed to create match. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = competitionId && homeTeamId && awayTeamId && homeTeamId !== awayTeamId && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-up max-h-[90vh] overflow-y-auto"
        style={{ background: '#111812', border: '1px solid #243028' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <div>
            <h2 className="font-condensed font-black text-[20px] text-text-1 tracking-tight">Create Match</h2>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">Schedule a new fixture</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text-1 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-[12px] font-mono"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              {error}
            </div>
          )}

          {/* Competition */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Competition *</label>
            {loadingComps ? <div className="h-10 bg-surface-2 rounded-lg animate-pulse" /> : (
              <select value={competitionId} onChange={e => setCompetitionId(e.target.value)} required
                className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
                style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
                <option value="">Select competition…</option>
                {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Season */}
          {competitionId && (
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Season</label>
              {loadingSeasons ? <div className="h-10 bg-surface-2 rounded-lg animate-pulse" /> : (
                <select value={seasonId} onChange={e => setSeasonId(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
                  style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
                  <option value="">Select season…</option>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Stage */}
          {seasonId && (
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Stage (optional)</label>
              {loadingStages ? <div className="h-10 bg-surface-2 rounded-lg animate-pulse" /> : (
                <select value={stageId} onChange={e => setStageId(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
                  style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
                  <option value="">No stage</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.number ? `${s.kind_display} ${s.number}` : s.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Teams */}
          {competitionId && (
            <>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Home Team *</label>
                {loadingTeams ? <div className="h-10 bg-surface-2 rounded-lg animate-pulse" /> : (
                  <select value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)} required
                    className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
                    style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
                    <option value="">Select home team…</option>
                    {teams.map(t => <option key={t.id} value={t.id} disabled={t.id === Number(awayTeamId)}>{t.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Away Team *</label>
                {loadingTeams ? <div className="h-10 bg-surface-2 rounded-lg animate-pulse" /> : (
                  <select value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)} required
                    className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
                    style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
                    <option value="">Select away team…</option>
                    {teams.map(t => <option key={t.id} value={t.id} disabled={t.id === Number(homeTeamId)}>{t.name}</option>)}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Kickoff */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Kickoff (optional)</label>
            <input type="datetime-local" value={kickoff} onChange={e => setKickoff(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg"
              style={{ background: '#0A0F0C', border: '1px solid #243028', colorScheme: 'dark' }} />
          </div>

          <button type="submit" disabled={!canSubmit}
            className="w-full py-3 rounded-lg font-condensed font-bold text-[14px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: '#22C55E', color: '#0A0F0C' }}>
            {submitting ? 'Creating…' : 'Create Match'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScoutMatchesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');

  function loadMatches(status = statusFilter) {
    setIsLoading(true);
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    api.get<Match[]>(API_PATHS.matches.list, params as Record<string, string | number | boolean | undefined>)
      .then(d => setMatches(Array.isArray(d) ? d : []))
      .catch(() => setMatches([]))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { loadMatches(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatusChange(s: string) {
    setStatusFilter(s);
    loadMatches(s);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none">Matches</h1>
          <p className="text-[11px] font-mono text-text-3 mt-0.5">Scout workspace</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-xl font-condensed font-bold text-[12px] tracking-[0.08em] hover:opacity-90 transition-opacity"
          style={{ background: '#22C55E', color: '#0A0F0C' }}>
          + Create
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 scrollbar-hide">
        {STATUS_OPTS.map(opt => (
          <button key={opt.value}
            onClick={() => handleStatusChange(opt.value)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-mono font-medium transition-colors"
            style={{
              background: statusFilter === opt.value ? '#22C55E' : '#111812',
              color: statusFilter === opt.value ? '#0A0F0C' : '#7A9E80',
              border: `1px solid ${statusFilter === opt.value ? '#22C55E' : '#243028'}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="animate-pulse rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 border-b last:border-0" style={{ borderBottomColor: 'rgba(36,48,40,0.4)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }} />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[13px] text-text-3 mb-3">No matches found</p>
          <button onClick={() => setShowCreate(true)} className="text-[12px] font-mono text-athlon hover:opacity-80">Create one →</button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {matches.map(m => <MatchRow key={m.id} match={m} onClick={() => navigate(`/scout/matches/${m.id}`)} />)}
        </div>
      )}

      {showCreate && (
        <CreateMatchModal
          onCreated={m => { setMatches(prev => [m, ...prev]); setShowCreate(false); navigate(`/scout/matches/${m.id}`); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
