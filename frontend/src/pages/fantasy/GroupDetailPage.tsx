import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import { useAuth } from '../../contexts/AuthContext';
import type { FantasyGroupDetail, GroupLeaderboardRow, Competition, Season, Stage } from '../../lib/types';

// ─── Invite Code Copy ─────────────────────────────────────────────────────────

function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback — select input text
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
        <span className="font-mono text-[15px] tracking-[0.25em] text-text-1 font-bold flex-1">{code}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-condensed font-bold text-[11px] tracking-[0.08em] transition-all"
          style={{
            background: copied ? 'rgba(34,197,94,0.12)' : '#111812',
            color: copied ? '#22C55E' : '#7A9E80',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.25)' : '#243028'}`,
          }}
        >
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4" /></svg>
              Copied
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="6" height="6" rx="1" /><path d="M1 7V1h6" /></svg>
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Rank badge ───────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: '#FBBF24', 2: '#CBD5E1', 3: '#B45309' };
  const color = colors[rank];
  return (
    <span className="font-condensed font-black text-[18px] tabular-nums w-7 text-center flex-shrink-0"
      style={{ color: color ?? '#40604A' }}>
      {rank}
    </span>
  );
}

// ─── Leaderboard section ──────────────────────────────────────────────────────

function GroupLeaderboard({ groupId }: { groupId: number }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [stageId, setStageId] = useState('');
  const [rows, setRows] = useState<GroupLeaderboardRow[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Competition[]>(API_PATHS.competitions.list)
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setCompetitions(arr);
        if (arr.length === 1) setCompetitionId(String(arr[0].id));
      })
      .catch(() => setCompetitions([]))
      .finally(() => setLoadingComps(false));
  }, []);

  useEffect(() => {
    if (!competitionId) { setSeasons([]); setSeasonId(''); return; }
    setLoadingSeasons(true);
    setSeasonId(''); setStageId(''); setStages([]);
    api.get<Season[]>(API_PATHS.seasons.list(Number(competitionId)))
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setSeasons(arr);
        if (arr.length === 1) setSeasonId(String(arr[0].id));
      })
      .catch(() => setSeasons([]))
      .finally(() => setLoadingSeasons(false));
  }, [competitionId]);

  useEffect(() => {
    if (!seasonId) { setStages([]); setStageId(''); return; }
    setLoadingStages(true);
    setStageId('');
    api.get<Stage[]>(API_PATHS.stages.list(Number(seasonId)))
      .then(d => setStages(Array.isArray(d) ? d : []))
      .catch(() => setStages([]))
      .finally(() => setLoadingStages(false));
  }, [seasonId]);

  useEffect(() => {
    if (!competitionId || !seasonId) { setRows([]); return; }
    setLoadingRows(true);
    setRowsError(null);
    const params: Record<string, string> = { competition: competitionId, season: seasonId };
    if (stageId) params['stage'] = stageId;
    api.get<{ group_id: number; rows: GroupLeaderboardRow[] }>(
      API_PATHS.fantasy.groupLeaderboard(groupId),
      params as Record<string, string | number | boolean | undefined>,
    )
      .then(d => setRows(d?.rows ?? []))
      .catch(() => setRowsError('Failed to load leaderboard'))
      .finally(() => setLoadingRows(false));
  }, [groupId, competitionId, seasonId, stageId]);

  return (
    <div>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3 mb-3">Leaderboard</h2>

      {/* Competition selector */}
      {loadingComps ? (
        <div className="h-10 bg-surface-1 rounded-lg animate-pulse mb-2" />
      ) : competitions.length > 1 ? (
        <div className="mb-2">
          <select value={competitionId} onChange={e => setCompetitionId(e.target.value)}
            className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
            style={{ background: '#111812', border: '1px solid #243028' }}>
            <option value="">Select competition…</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}

      {/* Season selector */}
      {competitionId && (
        loadingSeasons ? <div className="h-10 bg-surface-1 rounded-lg animate-pulse mb-2" /> :
        seasons.length > 1 ? (
          <div className="mb-2">
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
              style={{ background: '#111812', border: '1px solid #243028' }}>
              <option value="">Select season…</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : null
      )}

      {/* Stage filter */}
      {seasonId && stages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-hide">
          <button onClick={() => setStageId('')}
            className="flex-shrink-0 px-3 py-1 rounded-lg text-[10px] font-mono font-medium transition-colors"
            style={{ background: !stageId ? '#22C55E' : '#111812', color: !stageId ? '#0A0F0C' : '#7A9E80', border: `1px solid ${!stageId ? '#22C55E' : '#243028'}` }}>
            All
          </button>
          {stages.map(s => (
            <button key={s.id} onClick={() => setStageId(String(s.id))}
              className="flex-shrink-0 px-3 py-1 rounded-lg text-[10px] font-mono font-medium transition-colors"
              style={{ background: stageId === String(s.id) ? '#22C55E' : '#111812', color: stageId === String(s.id) ? '#0A0F0C' : '#7A9E80', border: `1px solid ${stageId === String(s.id) ? '#22C55E' : '#243028'}` }}>
              {s.number ? `${s.kind_display} ${s.number}` : s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {!competitionId || !seasonId ? (
        <p className="text-[11px] font-mono text-text-3 py-6 text-center">Select a competition and season to view rankings</p>
      ) : loadingRows ? (
        <div className="animate-pulse rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3 border-b last:border-0" style={{ borderBottomColor: 'rgba(36,48,40,0.4)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }}>
              <div className="w-6 h-4 bg-surface-2 rounded" />
              <div className="flex-1 h-4 bg-surface-2 rounded" />
              <div className="w-10 h-4 bg-surface-2 rounded" />
            </div>
          ))}
        </div>
      ) : rowsError ? (
        <p className="text-[12px] font-mono text-live py-4 text-center">{rowsError}</p>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[12px] text-text-3">No entries yet</p>
          <p className="text-[10px] font-mono text-text-3 mt-1">Populate after matches are played</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {rows.map(row => (
            <div key={row.fantasy_team_id}
              className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
              style={{ borderBottomColor: 'rgba(36,48,40,0.5)', background: row.rank === 1 ? 'rgba(251,191,36,0.03)' : undefined }}>
              <RankBadge rank={row.rank} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-text-1 truncate leading-tight">{row.name}</p>
                <p className="text-[10px] font-mono text-text-3 truncate">{row.owner_display_name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-condensed font-black text-[18px] text-text-1 tabular-nums leading-none">{row.total_points}</p>
                <p className="text-[9px] font-mono text-text-3">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = groupId ? parseInt(groupId, 10) : null;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState<FantasyGroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadGroup = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    api.get<FantasyGroupDetail>(API_PATHS.fantasy.groupDetail(id))
      .then(d => { setGroup(d); setError(null); })
      .catch(err => setError(err instanceof ApiError ? String(err.status) : 'Failed to load group'))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(loadGroup, [loadGroup]);

  async function handleLeave() {
    if (!id) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await api.post(API_PATHS.fantasy.groupLeave(id));
      navigate('/app/fantasy/groups');
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setLeaveError(typeof d['detail'] === 'string' ? d['detail'] : 'Failed to leave group');
      } else {
        setLeaveError('Failed to leave group');
      }
      setLeaving(false);
    }
  }

  async function handleRemoveMember(userId: number) {
    if (!id) return;
    setRemovingId(userId);
    try {
      await api.post(API_PATHS.fantasy.groupRemoveMember(id, userId));
      setGroup(prev => prev ? { ...prev, members: (prev.members ?? []).filter(m => m.user_id !== userId), member_count: prev.member_count - 1 } : prev);
    } catch {
      // Error silently — button resets
    } finally {
      setRemovingId(null);
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-7 h-7 rounded-full border-2 border-athlon border-t-transparent animate-spin" />
    </div>
  );

  if (error || !group) return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 mb-5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
        Groups
      </button>
      <div className="flex flex-col items-center gap-3 py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] font-mono text-live">{error ?? 'Group not found'}</p>
        <button onClick={loadGroup} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
      </div>
    </div>
  );

  const isOwner = user?.id === group.owner_id;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 animate-fade-in">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
        Groups
      </button>

      {/* Header */}
      <div className="px-5 py-5 rounded-xl mb-4" style={{ background: '#111812', border: '1px solid #243028' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-condensed font-black text-[26px] text-text-1 tracking-tight leading-tight">{group.name}</h1>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">
              {group.member_count} member{group.member_count !== 1 ? 's' : ''} · Owner: {group.owner_display_name}
            </p>
          </div>
          {isOwner && (
            <span className="px-2 py-1 rounded text-[9px] font-condensed font-bold tracking-wider flex-shrink-0"
              style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.15)' }}>
              OWNER
            </span>
          )}
        </div>

        {/* Invite code */}
        <div className="mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Invite Code</p>
          <InviteCode code={group.invite_code} />
        </div>
      </div>

      {/* Members */}
      <div className="mb-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3 mb-3">
          Members ({group.member_count})
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {(group.members ?? []).map((member, i) => (
            <div key={member.user_id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ background: i % 2 === 0 ? '#111812' : '#0A0F0C', borderBottom: i < (group.members?.length ?? 0) - 1 ? '1px solid rgba(36,48,40,0.4)' : undefined }}>
              {/* Avatar initials */}
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-condensed font-bold text-[12px]"
                style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.12)' }}>
                {member.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-text-1 truncate leading-tight">
                  {member.display_name}
                  {member.user_id === group.owner_id && (
                    <span className="ml-1.5 text-[9px] font-mono" style={{ color: '#22C55E' }}>owner</span>
                  )}
                </p>
                <p className="text-[10px] font-mono text-text-3">
                  Joined {new Date(member.joined_at).toLocaleDateString()}
                </p>
              </div>
              {/* Remove button — owner only, not themselves */}
              {isOwner && member.user_id !== group.owner_id && (
                <button
                  onClick={() => handleRemoveMember(member.user_id)}
                  disabled={removingId === member.user_id}
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-opacity disabled:opacity-40 hover:opacity-80"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  {removingId === member.user_id ? '…' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-6">
        <GroupLeaderboard groupId={group.id} />
      </div>

      {/* Leave group — non-owner only */}
      {!isOwner && (
        <div className="mt-2">
          {leaveError && (
            <p className="text-[12px] font-mono text-live mb-2 text-center">{leaveError}</p>
          )}
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="w-full py-3 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] transition-opacity disabled:opacity-40 hover:opacity-80"
            style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.18)' }}
          >
            {leaving ? 'Leaving…' : 'Leave Group'}
          </button>
        </div>
      )}
    </div>
  );
}
