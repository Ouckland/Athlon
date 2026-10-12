import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import { useAuth } from '../../contexts/AuthContext';
import type { FantasyTeamFull, Competition, Season } from '../../lib/types';

// ─── Create Team Modal ────────────────────────────────────────────────────────

function CreateTeamModal({ onCreated, onClose }: { onCreated: (team: FantasyTeamFull) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Competition[]>(API_PATHS.competitions.list)
      .then(data => setCompetitions(Array.isArray(data) ? data : []))
      .catch(() => setCompetitions([]))
      .finally(() => setLoadingComps(false));
  }, []);

  useEffect(() => {
    if (!competitionId) { setSeasons([]); setSeasonId(''); return; }
    setLoadingSeasons(true);
    setSeasonId('');
    api.get<Season[]>(API_PATHS.seasons.list(Number(competitionId)))
      .then(data => setSeasons(Array.isArray(data) ? data : []))
      .catch(() => setSeasons([]))
      .finally(() => setLoadingSeasons(false));
  }, [competitionId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const team = await api.post<FantasyTeamFull>(API_PATHS.fantasy.teams, {
        name: name.trim(),
        competition_id: Number(competitionId),
        season_id: Number(seasonId),
      });
      onCreated(team);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(
          typeof d['detail'] === 'string' ? d['detail'] :
          typeof d['non_field_errors'] === 'string' ? d['non_field_errors'] :
          Array.isArray(d['non_field_errors']) ? String(d['non_field_errors'][0]) :
          `Error ${err.status}`
        );
      } else {
        setError('Failed to create team. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim() && competitionId && seasonId && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-up"
        style={{ background: '#111812', border: '1px solid #243028' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-condensed font-black text-[20px] text-text-1 tracking-tight">Create Fantasy Team</h2>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">Pick a name and competition</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text-1 transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-[12px] font-mono" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              {error}
            </div>
          )}

          {/* Team name */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Team Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Computer Science United"
              maxLength={50}
              required
              className="w-full px-3 py-2.5 text-[13px] text-text-1 placeholder-text-3 outline-none rounded-lg transition-colors"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
          </div>

          {/* Competition */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Competition</label>
            {loadingComps ? (
              <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
            ) : (
              <select
                value={competitionId}
                onChange={e => setCompetitionId(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none cursor-pointer"
                style={{ background: '#0A0F0C', border: '1px solid #243028', color: competitionId ? '#E2F2E8' : '#40604A' }}
              >
                <option value="">Select competition…</option>
                {competitions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Season */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Season</label>
            {loadingSeasons ? (
              <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
            ) : (
              <select
                value={seasonId}
                onChange={e => setSeasonId(e.target.value)}
                required
                disabled={!competitionId || seasons.length === 0}
                className="w-full px-3 py-2.5 text-[13px] outline-none rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                style={{ background: '#0A0F0C', border: '1px solid #243028', color: seasonId ? '#E2F2E8' : '#40604A' }}
              >
                <option value="">{competitionId && seasons.length === 0 ? 'No seasons available' : 'Select season…'}</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 rounded-lg font-condensed font-bold text-[14px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: '#22C55E', color: '#0A0F0C' }}
          >
            {submitting ? 'Creating…' : 'Create Team'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Fantasy Team Card ────────────────────────────────────────────────────────

function FantasyTeamCard({ team, onManage }: { team: FantasyTeamFull; onManage: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#111812', border: '1px solid #243028' }}>
      {/* Top accent */}
      <div className="h-px w-full" style={{ background: '#22C55E' }} />

      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-condensed font-black text-[20px] text-text-1 tracking-tight leading-tight truncate">{team.name}</h3>
            <p className="text-[11px] font-mono text-text-3 mt-0.5 truncate">{team.competition.name}</p>
            <p className="text-[10px] font-mono text-text-3 mt-0.5">{team.season.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-condensed font-black text-[36px] text-text-1 leading-none tabular-nums">{team.total_points}</p>
            <p className="text-[9px] font-mono text-text-3 tracking-widest">PTS</p>
          </div>
        </div>

        <button
          onClick={onManage}
          className="w-full py-2.5 rounded-lg font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-90 transition-opacity"
          style={{ background: '#1E2A20', color: '#22C55E', border: '1px solid #243028' }}
        >
          Manage Squad →
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FantasyPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [teams, setTeams] = useState<FantasyTeamFull[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setTeamsLoading(true);
    api.get<FantasyTeamFull[]>(API_PATHS.fantasy.teams)
      .then(data => { setTeams(Array.isArray(data) ? data : []); setTeamsError(null); })
      .catch(() => setTeamsError('Failed to load your fantasy teams'))
      .finally(() => setTeamsLoading(false));
  }, [isAuthenticated]);

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-athlon border-t-transparent animate-spin" />
      </div>
    );
  }

  // Unauthenticated landing
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-[56px] mb-6 select-none">⚽</div>
        <h1 className="font-condensed font-black text-[32px] text-text-1 tracking-tight leading-tight mb-3">
          Fantasy Football
        </h1>
        <p className="text-[13px] text-text-3 leading-relaxed mb-8">
          Build your squad, pick your captain, and compete on the leaderboard. Sign in to start playing.
        </p>
        <button
          onClick={() => navigate('/auth/login')}
          className="inline-flex items-center px-7 py-3 rounded-xl font-condensed font-bold text-[15px] tracking-[0.08em] hover:opacity-90 transition-opacity"
          style={{ background: '#22C55E', color: '#0A0F0C' }}
        >
          Sign in to play
        </button>
        <div className="mt-4">
          <button onClick={() => navigate('/app/fantasy/leaderboard')} className="text-[12px] font-mono text-text-3 hover:text-text-2 transition-colors">
            View leaderboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none">Fantasy</h1>
          <p className="text-[11px] font-mono text-text-3 mt-0.5">Build your squad. Earn points.</p>
        </div>
        <button
          onClick={() => navigate('/app/fantasy/leaderboard')}
          className="text-[12px] font-mono text-text-3 hover:text-text-2 transition-colors"
        >
          Leaderboard →
        </button>
      </div>

      {teamsLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="animate-pulse rounded-xl h-40" style={{ background: '#111812', border: '1px solid #243028' }} />)}
        </div>
      ) : teamsError ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[13px] font-mono text-live mb-2">{teamsError}</p>
          <button onClick={() => window.location.reload()} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      ) : teams.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center py-16 px-6 text-center rounded-2xl" style={{ background: '#111812', border: '1px dashed #243028' }}>
          <div className="text-[40px] mb-4 select-none">⚽</div>
          <h2 className="font-condensed font-black text-[22px] text-text-1 tracking-tight mb-2">No fantasy team yet</h2>
          <p className="text-[12px] text-text-3 leading-relaxed mb-6 max-w-[260px]">
            Create your first fantasy team to start picking players and competing on the leaderboard.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-2.5 rounded-xl font-condensed font-bold text-[14px] tracking-[0.08em] hover:opacity-90 transition-opacity"
            style={{ background: '#22C55E', color: '#0A0F0C' }}
          >
            Create your team
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => (
            <FantasyTeamCard
              key={team.id}
              team={team}
              onManage={() => navigate(`/app/fantasy/team?teamId=${team.id}`)}
            />
          ))}

          <button
            onClick={() => setShowCreate(true)}
            className="w-full py-3 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] transition-colors hover:border-athlon/40"
            style={{ background: 'transparent', border: '1px dashed #243028', color: '#40604A' }}
          >
            + Create another team
          </button>
        </div>
      )}

      {showCreate && (
        <CreateTeamModal
          onCreated={team => { setTeams(prev => [...prev, team]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
