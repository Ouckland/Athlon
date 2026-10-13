import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { LeaderboardRow, Competition, Season, Stage } from '../../lib/types';

// ─── Rank medal ───────────────────────────────────────────────────────────────

function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-condensed font-black text-[22px] tabular-nums" style={{ color: '#FBBF24' }}>1</span>;
  if (rank === 2) return <span className="font-condensed font-black text-[22px] tabular-nums" style={{ color: '#CBD5E1' }}>2</span>;
  if (rank === 3) return <span className="font-condensed font-black text-[22px] tabular-nums" style={{ color: '#B45309' }}>3</span>;
  return <span className="font-condensed font-bold text-[16px] text-text-3 tabular-nums">{rank}</span>;
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardEntry({ row, isFirst }: { row: LeaderboardRow; isFirst?: boolean }) {
  const isTop3 = row.rank <= 3;

  return (
    <div
      className="flex items-center gap-4 px-4 py-3.5"
      style={{
        background: isFirst ? 'rgba(251,191,36,0.04)' : row.rank === 2 ? 'rgba(203,213,225,0.02)' : row.rank === 3 ? 'rgba(180,83,9,0.03)' : undefined,
        borderBottom: '1px solid rgba(36,48,40,0.5)',
      }}
    >
      {/* Rank */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center">
        <RankDisplay rank={row.rank} />
      </div>

      {/* Team + owner */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate leading-tight ${isTop3 ? 'text-text-1' : 'text-text-2'}`}>
          {row.name}
        </p>
        <p className="text-[10px] font-mono text-text-3 truncate mt-0.5">{row.owner_display_name}</p>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <p className={`font-condensed font-black text-[20px] tabular-nums leading-none ${isTop3 ? 'text-text-1' : 'text-text-2'}`}>
          {row.total_points}
        </p>
        <p className="text-[9px] font-mono text-text-3">pts</p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(36,48,40,0.4)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }}>
          <div className="w-8 h-5 bg-surface-2 rounded" />
          <div className="flex-1">
            <div className="w-32 h-3 bg-surface-2 rounded mb-1.5" />
            <div className="w-20 h-2 bg-surface-2 rounded" />
          </div>
          <div className="w-12 h-6 bg-surface-2 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const [competitionId, setCompetitionId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [stageId, setStageId] = useState('');

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load competitions
  useEffect(() => {
    api.get<Competition[]>(API_PATHS.competitions.list)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setCompetitions(arr);
        if (arr.length === 1) setCompetitionId(String(arr[0].id));
      })
      .catch(() => setCompetitions([]))
      .finally(() => setLoadingComps(false));
  }, []);

  // Load seasons when competition changes
  useEffect(() => {
    if (!competitionId) { setSeasons([]); setSeasonId(''); return; }
    setLoadingSeasons(true);
    setSeasonId('');
    setStageId('');
    setStages([]);
    api.get<Season[]>(API_PATHS.seasons.list(Number(competitionId)))
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setSeasons(arr);
        if (arr.length === 1) setSeasonId(String(arr[0].id));
      })
      .catch(() => setSeasons([]))
      .finally(() => setLoadingSeasons(false));
  }, [competitionId]);

  // Load stages when season changes
  useEffect(() => {
    if (!seasonId) { setStages([]); setStageId(''); return; }
    setLoadingStages(true);
    setStageId('');
    api.get<Stage[]>(API_PATHS.stages.list(Number(seasonId)))
      .then(data => setStages(Array.isArray(data) ? data : []))
      .catch(() => setStages([]))
      .finally(() => setLoadingStages(false));
  }, [seasonId]);

  // Load leaderboard
  useEffect(() => {
    if (!competitionId || !seasonId) { setRows([]); return; }
    setLoadingRows(true);
    setError(null);
    const params: Record<string, string | number> = {
      competition: competitionId,
      season: seasonId,
    };
    if (stageId) params['stage'] = stageId;
    api.get<{ rows: LeaderboardRow[] }>(API_PATHS.fantasy.leaderboard, params as Record<string, string | number | boolean | undefined>)
      .then(data => setRows(data?.rows ?? []))
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoadingRows(false));
  }, [competitionId, seasonId, stageId]);

  const selectedComp = competitions.find(c => String(c.id) === competitionId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none">Leaderboard</h1>
        {selectedComp && <p className="text-[11px] font-mono text-text-3 mt-0.5">{selectedComp.name}</p>}
      </div>

      {/* Competition selector */}
      {loadingComps ? (
        <div className="h-10 bg-surface-1 rounded-lg animate-pulse mb-3" />
      ) : competitions.length > 1 ? (
        <div className="mb-3">
          <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Competition</label>
          <select
            value={competitionId}
            onChange={e => setCompetitionId(e.target.value)}
            className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
            style={{ background: '#111812', border: '1px solid #243028' }}
          >
            <option value="">Select competition…</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}

      {/* Season selector */}
      {competitionId && (
        loadingSeasons ? (
          <div className="h-10 bg-surface-1 rounded-lg animate-pulse mb-3" />
        ) : seasons.length > 1 ? (
          <div className="mb-3">
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Season</label>
            <select
              value={seasonId}
              onChange={e => setSeasonId(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
              style={{ background: '#111812', border: '1px solid #243028' }}
            >
              <option value="">Select season…</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : null
      )}

      {/* Stage filter */}
      {seasonId && stages.length > 0 && (
        <div className="mb-5">
          <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">
            Filter by stage <span className="normal-case">(optional)</span>
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setStageId('')}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-mono font-medium transition-colors"
              style={{ background: !stageId ? '#22C55E' : '#111812', color: !stageId ? '#0A0F0C' : '#7A9E80', border: `1px solid ${!stageId ? '#22C55E' : '#243028'}` }}
            >
              All
            </button>
            {stages.map(s => (
              <button
                key={s.id}
                onClick={() => setStageId(String(s.id))}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-mono font-medium transition-colors"
                style={{ background: stageId === String(s.id) ? '#22C55E' : '#111812', color: stageId === String(s.id) ? '#0A0F0C' : '#7A9E80', border: `1px solid ${stageId === String(s.id) ? '#22C55E' : '#243028'}` }}
              >
                {s.number ? `${s.kind_display} ${s.number}` : s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt to select */}
      {!competitionId && !loadingComps && (
        <div className="py-16 text-center">
          <p className="text-[13px] text-text-3">Select a competition to view the leaderboard</p>
        </div>
      )}

      {/* Leaderboard table */}
      {competitionId && seasonId && (
        loadingRows ? (
          <Skeleton />
        ) : error ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
            <p className="text-[13px] font-mono text-live mb-2">{error}</p>
            <button onClick={() => window.location.reload()} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
            <p className="text-[13px] text-text-3">No entries yet</p>
            <p className="text-[10px] font-mono text-text-3 mt-1">Leaderboard populates after matches are played</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
            {rows.map((row, i) => (
              <LeaderboardEntry key={row.fantasy_team_id} row={row} isFirst={i === 0} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
