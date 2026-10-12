import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import { useAuth } from '../contexts/AuthContext';
import type { ApiTeam, ApiPlayer, Match } from '../lib/types';

// ─── Position config ──────────────────────────────────────────────────────────

const POS_COLOR: Record<string, string> = {
  GK:  '#FBBF24',
  DEF: '#3B82F6',
  MID: '#22C55E',
  ATT: '#EF4444',
};

const POS_LABEL: Record<string, string> = {
  GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Attackers',
};

type Tab = 'SQUAD' | 'MATCHES' | 'INFO';

// ─── Manager type ─────────────────────────────────────────────────────────────

type Manager = { user_id: number; display_name: string };

// ─── Shield crest ─────────────────────────────────────────────────────────────

function ShieldCrest({ initials, size = 80 }: { initials: string; size?: number }) {
  const id = `shield-detail-${initials}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id={id}>
          <path d="M40 4L8 14v26c0 19 13.5 33.5 32 38 18.5-4.5 32-19 32-38V14L40 4Z" />
        </clipPath>
      </defs>
      <path d="M40 4L8 14v26c0 19 13.5 33.5 32 38 18.5-4.5 32-19 32-38V14L40 4Z"
        fill="#162019" stroke="#243028" strokeWidth="1.5" />
      <text x="40" y="46" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Barlow Condensed', sans-serif" fontWeight="900"
        fontSize={initials.length > 2 ? 18 : 24} fill="#22C55E" letterSpacing="0.05em">
        {initials}
      </text>
    </svg>
  );
}

function TeamCrestLarge({ team }: { team: ApiTeam }) {
  const [err, setErr] = useState(false);
  const initials = team.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (!team.logo || err) return <ShieldCrest initials={initials} size={80} />;
  return (
    <img src={team.logo} alt={team.name} onError={() => setErr(true)}
      className="object-contain flex-shrink-0" style={{ width: 80, height: 80 }} />
  );
}

// ─── Player avatar ────────────────────────────────────────────────────────────

function PlayerAvatar({ player }: { player: ApiPlayer }) {
  const [err, setErr] = useState(false);
  const posColor = POS_COLOR[player.position] ?? '#7A9E80';
  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`;
  if (!player.photo || err) {
    return (
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-condensed font-bold"
        style={{ background: posColor + '20', color: posColor, border: `1px solid ${posColor}30` }}>
        {initials}
      </div>
    );
  }
  return (
    <img src={player.photo} alt={player.display_name} onError={() => setErr(true)}
      className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
      style={{ border: '1px solid #243028' }} />
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, statusDisplay }: { status: string; statusDisplay: string }) {
  const isLive = status === 'LIVE' || status === 'HALFTIME';
  const isFinished = status === 'FINISHED';
  const color = isLive ? '#EF4444' : isFinished ? '#7A9E80' : '#A3C4AA';
  const bg = isLive ? '#EF444420' : isFinished ? '#1E2A20' : '#162019';
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
      style={{ background: bg, color, border: `1px solid ${color}30` }}>
      {isLive ? `● ${statusDisplay}` : statusDisplay}
    </span>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 animate-pulse">
      <div className="w-16 h-3 bg-surface-2 rounded mb-5" />
      <div className="rounded-xl h-36 bg-surface-1 mb-6" style={{ border: '1px solid #243028' }} />
      <div className="flex gap-4 mb-6">
        {[1, 2, 3].map(i => <div key={i} className="h-9 w-20 bg-surface-1 rounded-lg" />)}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-surface-1 rounded-lg" />)}
      </div>
    </div>
  );
}

function PlayersSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-surface-1 rounded-lg" />)}
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-16 bg-surface-1 rounded-lg" />)}
    </div>
  );
}

// ─── Hero header ─────────────────────────────────────────────────────────────

function TeamHero({ team }: { team: ApiTeam }) {
  return (
    <div className="relative rounded-xl overflow-hidden mb-5"
      style={{ background: '#111812', border: '1px solid #243028' }}>
      {/* diagonal stripe texture */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'repeating-linear-gradient(135deg, #22C55E 0px, #22C55E 1px, transparent 1px, transparent 20px)',
      }} />
      {/* subtle top edge accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, #22C55E60, transparent)' }} />

      <div className="relative flex items-start gap-5 px-5 py-5">
        <TeamCrestLarge team={team} />

        <div className="flex-1 min-w-0">
          <h1 className="font-condensed font-black text-[28px] sm:text-[34px] text-text-1 tracking-tight leading-none uppercase">
            {team.name}
          </h1>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-[11px] text-text-3">{team.short_name}</span>
            {team.organization?.name && (
              <>
                <span className="text-text-3 text-[10px]">·</span>
                <span className="text-[11px] text-text-3">{team.organization.name}</span>
              </>
            )}
          </div>

          {Array.isArray(team.competitions) && team.competitions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {team.competitions.map(c => (
                <span key={c.id}
                  className="inline-block text-[10px] font-mono px-2 py-0.5 rounded tracking-wide"
                  style={{ background: '#1E2A20', color: '#A3C4AA', border: '1px solid #243028' }}>
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {team.captain && (
            <div className="flex items-center gap-2 mt-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#22C55E20', border: '1px solid #22C55E40' }}>
                <span className="font-condensed font-black text-[8px] text-athlon">
                  {team.captain.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </span>
              </div>
              <span className="text-[10px] font-mono text-text-3 uppercase tracking-widest">Captain</span>
              <span className="text-[11px] text-text-2 font-medium">{team.captain.display_name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Squad tab ────────────────────────────────────────────────────────────────

function SquadTab({ teamId }: { teamId: number }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<ApiPlayer[] | { results: ApiPlayer[] }>(API_PATHS.players.list, { team: teamId })
      .then(data => {
        const list = Array.isArray(data) ? data : (data as { results: ApiPlayer[] }).results ?? [];
        setPlayers(list);
        setError(null);
      })
      .catch(() => setError('Failed to load squad'))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <PlayersSkeleton />;

  if (error) {
    return (
      <div className="py-10 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] text-live mb-2">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); api.get<ApiPlayer[] | { results: ApiPlayer[] }>(API_PATHS.players.list, { team: teamId }).then(d => { const list = Array.isArray(d) ? d : (d as { results: ApiPlayer[] }).results ?? []; setPlayers(list); }).catch(() => setError('Failed to load squad')).finally(() => setLoading(false)); }}
          className="text-[12px] font-mono text-athlon hover:opacity-80 min-h-[44px] px-4">
          Retry →
        </button>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] text-text-3 font-mono">No squad registered</p>
      </div>
    );
  }

  const byPos: Record<string, ApiPlayer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of players) {
    if (byPos[p.position]) byPos[p.position].push(p);
    else byPos['ATT'].push(p);
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
      {(['GK', 'DEF', 'MID', 'ATT'] as const).map(pos => {
        const posPlayers = byPos[pos] ?? [];
        if (!posPlayers.length) return null;
        const color = POS_COLOR[pos];
        return (
          <div key={pos}>
            <div className="px-4 py-2" style={{ background: color + '10', borderBottom: '1px solid rgba(36,48,40,0.5)' }}>
              <span className="text-[9px] font-condensed font-bold tracking-[0.18em] uppercase" style={{ color }}>
                {POS_LABEL[pos]} · {posPlayers.length}
              </span>
            </div>
            {posPlayers.map((p, idx) => (
              <button key={p.id} onClick={() => navigate(`/players/${p.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left group transition-colors hover:bg-surface-2 min-h-[52px]"
                style={{ borderBottom: idx < posPlayers.length - 1 ? '1px solid rgba(36,48,40,0.4)' : 'none' }}>
                <PlayerAvatar player={p} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-1 truncate group-hover:text-athlon transition-colors">
                    {p.display_name}
                  </p>
                  <p className="text-[10px] font-mono text-text-3">{p.position_display}</p>
                </div>
                {p.shirt_number !== null && (
                  <span className="font-condensed font-black text-[18px] tabular-nums flex-shrink-0"
                    style={{ color: '#344A38' }}>
                    #{p.shirt_number}
                  </span>
                )}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
                  className="text-text-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M4 2l4 4-4 4" />
                </svg>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Matches tab ──────────────────────────────────────────────────────────────

function MatchesTab({ teamId }: { teamId: number }) {
  const navigate = useNavigate();
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Match[] | { results: Match[] }>(API_PATHS.matches.list)
      .then(data => {
        const list = Array.isArray(data) ? data : ((data as { results: Match[] }).results ?? []);
        setAllMatches(list);
        setError(null);
      })
      .catch(() => setError('Failed to load matches'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [teamId]);

  if (loading) return <MatchesSkeleton />;

  if (error) {
    return (
      <div className="py-10 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] text-live mb-2">{error}</p>
        <button onClick={load} className="text-[12px] font-mono text-athlon hover:opacity-80 min-h-[44px] px-4">Retry →</button>
      </div>
    );
  }

  const teamMatches = allMatches.filter(m => m.home_team.id === teamId || m.away_team.id === teamId);
  const finished = teamMatches.filter(m => m.status === 'FINISHED');
  const upcoming = teamMatches.filter(m => !['FINISHED', 'CANCELLED', 'POSTPONED'].includes(m.status));

  if (teamMatches.length === 0) {
    return (
      <div className="py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] text-text-3 font-mono">No matches found</p>
      </div>
    );
  }

  const MatchRow = ({ match }: { match: Match }) => {
    const isHome = match.home_team.id === teamId;
    const opponent = isHome ? match.away_team : match.home_team;
    const isLive = match.status === 'LIVE' || match.status === 'HALFTIME';
    const isFinished = match.status === 'FINISHED';
    const kickoff = new Date(match.kickoff_at);
    const dateStr = kickoff.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const timeStr = kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    return (
      <button onClick={() => navigate(`/matches/${match.id}`)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left group transition-colors hover:bg-surface-2 min-h-[52px]"
        style={{ borderBottom: '1px solid rgba(36,48,40,0.4)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-mono text-text-3 uppercase tracking-wider truncate">
              {match.competition.name}{match.stage ? ` · ${match.stage.name}` : ''}
            </span>
          </div>
          <p className="text-[13px] font-medium text-text-1 truncate group-hover:text-athlon transition-colors">
            {isHome ? 'vs' : '@'} {opponent.name}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isFinished ? (
            <span className="font-condensed font-bold text-[16px] text-text-1 tabular-nums">
              {isHome
                ? `${match.home_score ?? '?'} – ${match.away_score ?? '?'}`
                : `${match.away_score ?? '?'} – ${match.home_score ?? '?'}`}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-text-2">
              {isLive ? `${match.minute ?? 0}'` : `${dateStr} ${timeStr}`}
            </span>
          )}
          <StatusBadge status={match.status} statusDisplay={match.status_display} />
        </div>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
          className="text-text-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <path d="M4 2l4 4-4 4" />
        </svg>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 mb-2">Upcoming</p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028', background: '#111812' }}>
            {upcoming.map(m => <MatchRow key={m.id} match={m} />)}
          </div>
        </div>
      )}
      {finished.length > 0 && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 mb-2">Recent Results</p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028', background: '#111812' }}>
            {finished.slice(0, 10).map(m => <MatchRow key={m.id} match={m} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Info tab ─────────────────────────────────────────────────────────────────

function InfoTab({ team, teamId }: { team: ApiTeam; teamId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [managersError, setManagersError] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  const loadManagers = () => {
    setManagersLoading(true);
    api.get<Manager[]>(API_PATHS.teams.managers(teamId))
      .then(data => { setManagers(Array.isArray(data) ? data : []); setManagersError(null); })
      .catch(() => setManagersError('Failed to load managers'))
      .finally(() => setManagersLoading(false));
  };

  useEffect(() => { loadManagers(); }, [teamId]);

  const removeManager = (userId: number) => {
    api.delete(API_PATHS.teams.managerItem(teamId, userId))
      .then(() => setManagers(prev => prev.filter(m => m.user_id !== userId)))
      .catch(() => {/* silently keep */});
  };

  const addManager = () => {
    const uid = parseInt(addUserId.trim(), 10);
    if (!uid || isNaN(uid)) { setAddError('Enter a valid user ID'); return; }
    setAddLoading(true);
    setAddError(null);
    api.post<Manager>(API_PATHS.teams.managers(teamId), { user_id: uid })
      .then(m => { setManagers(prev => [...prev, m]); setAddUserId(''); })
      .catch(() => setAddError('Failed to add manager'))
      .finally(() => setAddLoading(false));
  };

  const createdDate = new Date(team.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-start justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid rgba(36,48,40,0.5)' }}>
      <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-3 flex-shrink-0">{label}</span>
      <span className="text-[12px] text-text-2 text-right">{value}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Team info */}
      <div className="rounded-xl px-4" style={{ background: '#111812', border: '1px solid #243028' }}>
        <InfoRow label="Organization" value={team.organization?.name || '—'} />
        <InfoRow label="Captain" value={team.captain?.display_name || '—'} />
        <InfoRow label="Created" value={createdDate} />
        {(!Array.isArray(team.competitions) || team.competitions.length === 0) && <InfoRow label="Competitions" value="—" />}
      </div>

      {/* Competitions */}
      {Array.isArray(team.competitions) && team.competitions.length > 0 && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 mb-2">Competitions</p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028', background: '#111812' }}>
            {team.competitions.map((c, idx) => (
              <div key={c.id}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: idx < team.competitions.length - 1 ? '1px solid rgba(36,48,40,0.5)' : 'none' }}>
                <span className="text-[12px] text-text-1">{c.name}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: '#1E2A20', color: c.status === 'ACTIVE' ? '#22C55E' : '#7A9E80', border: '1px solid #243028' }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Managers */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 mb-2">Managers</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028', background: '#111812' }}>
          {managersLoading ? (
            <div className="animate-pulse space-y-2 p-4">
              {[1, 2].map(i => <div key={i} className="h-10 bg-surface-2 rounded" />)}
            </div>
          ) : managersError ? (
            <div className="px-4 py-4 text-center">
              <p className="text-[12px] text-live mb-2">{managersError}</p>
              <button onClick={loadManagers} className="text-[11px] font-mono text-athlon hover:opacity-80 min-h-[44px] px-4">Retry →</button>
            </div>
          ) : managers.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-[12px] text-text-3 font-mono">No managers assigned</p>
            </div>
          ) : (
            managers.map((m, idx) => (
              <div key={m.user_id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: idx < managers.length - 1 ? '1px solid rgba(36,48,40,0.5)' : 'none' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: '#1E2A20', border: '1px solid #243028' }}>
                  <span className="font-condensed font-bold text-[11px] text-text-2">
                    {m.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 text-[13px] text-text-1 truncate">{m.display_name}</span>
                {isAdmin && (
                  <button onClick={() => removeManager(m.user_id)}
                    className="text-[10px] font-mono text-live hover:opacity-70 transition-opacity min-h-[44px] px-3">
                    Remove
                  </button>
                )}
              </div>
            ))
          )}

          {/* Add manager — admin only */}
          {isAdmin && (
            <div className="px-4 py-3" style={{ borderTop: '1px solid #243028' }}>
              <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-text-3 mb-2">Add manager</p>
              <div className="flex gap-2">
                <input
                  ref={addInputRef}
                  type="number"
                  value={addUserId}
                  onChange={e => setAddUserId(e.target.value)}
                  placeholder="User ID"
                  className="flex-1 px-3 py-2 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-lg"
                  style={{ background: '#0A0F0C', border: '1px solid #243028' }}
                  onKeyDown={e => e.key === 'Enter' && addManager()}
                />
                <button onClick={addManager} disabled={addLoading}
                  className="px-4 py-2 text-[11px] font-mono rounded-lg min-h-[44px] transition-opacity disabled:opacity-50"
                  style={{ background: '#22C55E20', color: '#22C55E', border: '1px solid #22C55E40' }}>
                  {addLoading ? '…' : 'Add'}
                </button>
              </div>
              {addError && <p className="text-[10px] font-mono text-live mt-1.5">{addError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ['SQUAD', 'MATCHES', 'INFO'];
  return (
    <div className="flex mb-5" style={{ borderBottom: '2px solid #243028' }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          className="flex-1 py-2.5 text-[11px] font-condensed font-bold uppercase tracking-[0.12em] transition-colors relative min-h-[44px]"
          style={{ color: active === t ? '#22C55E' : '#7A9E80' }}>
          {t}
          {active === t && (
            <div className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-athlon" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const id = teamId ? parseInt(teamId, 10) : null;

  const [team, setTeam] = useState<ApiTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('SQUAD');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<ApiTeam>(API_PATHS.teams.detail(id))
      .then(data => { setTeam(data); setError(null); })
      .catch(() => setError('Failed to load team'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageSkeleton />;

  if (error || !team) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/teams')}
          className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-5 min-h-[44px]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
          Teams
        </button>
        <div className="flex flex-col items-center gap-3 py-16 text-center rounded-xl"
          style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[13px] font-mono text-live">{error ?? 'Team not found'}</p>
          <button onClick={() => window.location.reload()}
            className="text-[11px] font-mono text-athlon hover:opacity-80 min-h-[44px] px-4">
            Retry →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 animate-fade-in">
      {/* Back nav */}
      <button onClick={() => navigate('/teams')}
        className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-4 min-h-[44px]">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M8 2L4 6l4 4" />
        </svg>
        Teams
      </button>

      {/* Hero */}
      <TeamHero team={team} />

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="animate-fade-in" key={activeTab}>
        {activeTab === 'SQUAD' && <SquadTab teamId={id!} />}
        {activeTab === 'MATCHES' && <MatchesTab teamId={id!} />}
        {activeTab === 'INFO' && <InfoTab team={team} teamId={id!} />}
      </div>
    </div>
  );
}
