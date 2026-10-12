import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { ApiPlayer, ApiTeam } from '../lib/types';

// ─── Position palette ─────────────────────────────────────────────────────────

const POS: Record<string, { color: string; label: string; order: number }> = {
  GK:  { color: '#FBBF24', label: 'Goalkeepers', order: 0 },
  DEF: { color: '#3B82F6', label: 'Defenders',   order: 1 },
  MID: { color: '#22C55E', label: 'Midfielders', order: 2 },
  ATT: { color: '#EF4444', label: 'Attackers',   order: 3 },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function PlayerAvatar({ player, sizePx = 44 }: { player: ApiPlayer; sizePx?: number }) {
  const [err, setErr] = useState(false);
  const color = POS[player.position]?.color ?? '#7A9E80';
  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase();
  const fontSize = Math.round(sizePx * 0.33);

  if (!player.photo || err) {
    return (
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0 font-condensed font-black select-none"
        style={{
          width: sizePx, height: sizePx,
          background: color + '18',
          border: `1.5px solid ${color}35`,
          fontSize,
          color,
        }}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={player.photo} alt={player.display_name}
      onError={() => setErr(true)}
      className="rounded-xl object-cover flex-shrink-0"
      style={{ width: sizePx, height: sizePx, border: '1px solid #243028' }}
    />
  );
}

// ─── Position pill ────────────────────────────────────────────────────────────

function PosPill({ position, full = false }: { position: string; full?: boolean }) {
  const cfg = POS[position];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center font-condensed font-bold tracking-wider leading-none flex-shrink-0"
      style={{
        fontSize: full ? 10 : 9,
        padding: full ? '3px 7px' : '2px 5px',
        borderRadius: 4,
        background: cfg.color + '18',
        color: cfg.color,
        border: `1px solid ${cfg.color}30`,
      }}
    >
      {full ? position : position}
    </span>
  );
}

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, onClick }: { player: ApiPlayer; onClick: () => void }) {
  const color = POS[player.position]?.color ?? '#7A9E80';
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left group transition-colors border-b last:border-0"
      style={{ borderBottomColor: 'rgba(36,48,40,0.45)' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#162019')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <PlayerAvatar player={player} sizePx={44} />

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text-1 truncate leading-tight group-hover:text-athlon transition-colors">
          {player.display_name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <PosPill position={player.position} />
          {player.team && (
            <span className="text-[10px] font-mono text-text-3 truncate">{player.team.short_name}</span>
          )}
        </div>
      </div>

      {/* Shirt number — right-aligned watermark */}
      {player.shirt_number != null && (
        <span
          className="font-condensed font-black tabular-nums flex-shrink-0 select-none leading-none"
          style={{ fontSize: 22, color, opacity: 0.45 }}
        >
          {player.shirt_number}
        </span>
      )}

      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        className="text-text-3 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:text-athlon transition-all">
        <path d="M3.5 1.5l4 4-4 4" />
      </svg>
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function PosSection({ position, players, onPlayer }: {
  position: string; players: ApiPlayer[]; onPlayer: (id: number) => void;
}) {
  const cfg = POS[position];
  if (!cfg || !players.length) return null;
  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ background: cfg.color + '0D', borderBottomColor: cfg.color + '22' }}
      >
        <span className="font-condensed font-black text-[11px] tracking-[0.18em] uppercase" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <span className="font-mono text-[10px]" style={{ color: cfg.color, opacity: 0.55 }}>{players.length}</span>
      </div>
      {players.map(p => <PlayerRow key={p.id} player={p} onClick={() => onPlayer(p.id)} />)}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse" style={{ border: '1px solid #243028' }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i}
          className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
          style={{ borderBottomColor: 'rgba(36,48,40,0.4)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }}>
          <div className="w-11 h-11 bg-surface-3 rounded-xl flex-shrink-0" />
          <div className="flex-1">
            <div className="w-32 h-3 bg-surface-3 rounded mb-1.5" />
            <div className="w-20 h-2.5 bg-surface-3 rounded" />
          </div>
          <div className="w-6 h-5 bg-surface-3 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const POS_KEYS = ['GK', 'DEF', 'MID', 'ATT'] as const;

export default function PlayersPage() {
  const navigate = useNavigate();

  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [teams, setTeams]     = useState<ApiTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]   = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    setIsLoading(true);
    Promise.allSettled([
      api.get<ApiPlayer[] | { results: ApiPlayer[] }>(API_PATHS.players.list),
      api.get<ApiTeam[] | { results: ApiTeam[] }>(API_PATHS.teams.list),
    ]).then(([pr, tr]) => {
      if (pr.status === 'fulfilled') {
        const d = pr.value;
        setPlayers(Array.isArray(d) ? d : (d as { results: ApiPlayer[] }).results ?? []);
      } else setError('Failed to load players');
      if (tr.status === 'fulfilled') {
        const d = tr.value;
        setTeams(Array.isArray(d) ? d : (d as { results: ApiTeam[] }).results ?? []);
      }
    }).finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return players
      .filter(p =>
        (!posFilter || p.position === posFilter) &&
        (!teamFilter || String(p.team?.id) === teamFilter) &&
        (!q || p.display_name.toLowerCase().includes(q) || p.team?.name.toLowerCase().includes(q))
      )
      .sort((a, b) =>
        (POS[a.position]?.order ?? 9) - (POS[b.position]?.order ?? 9) ||
        a.display_name.localeCompare(b.display_name)
      );
  }, [players, posFilter, teamFilter, search]);

  // Per-position counts for tabs
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    players.forEach(p => { c[p.position] = (c[p.position] ?? 0) + 1; });
    return c;
  }, [players]);

  const hasFilters = !!posFilter || !!teamFilter || !!search;
  const showTeamFilter = teams.length > 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="font-condensed font-black text-[32px] text-text-1 tracking-tight leading-none uppercase">Players</h1>
            {!isLoading && !error && (
              <p className="text-[11px] font-mono text-text-3 mt-0.5">
                {filtered.length === players.length
                  ? `${players.length} player${players.length !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${players.length}`}
              </p>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <circle cx="7" cy="7" r="5" /><path d="M13 13l-2.5-2.5" strokeLinecap="round" />
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-4 py-2 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-lg w-36 sm:w-44"
              style={{ background: '#111812', border: '1px solid #243028' }}
            />
          </div>
        </div>

        {/* Position filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide mb-3">
          <button onClick={() => setPosFilter('')}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-condensed font-bold tracking-wider transition-all"
            style={{
              background: !posFilter ? '#22C55E' : '#111812',
              color: !posFilter ? '#0A0F0C' : '#7A9E80',
              border: `1px solid ${!posFilter ? '#22C55E' : '#243028'}`,
            }}>
            ALL {!isLoading && `(${players.length})`}
          </button>
          {POS_KEYS.map(pos => (
            <button key={pos} onClick={() => setPosFilter(p => p === pos ? '' : pos)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-condensed font-bold tracking-wider transition-all"
              style={{
                background: posFilter === pos ? POS[pos].color + '22' : '#111812',
                color: posFilter === pos ? POS[pos].color : '#7A9E80',
                border: `1px solid ${posFilter === pos ? POS[pos].color + '50' : '#243028'}`,
              }}>
              {pos} {!isLoading && counts[pos] ? `(${counts[pos]})` : ''}
            </button>
          ))}
        </div>

        {/* Team filter */}
        {showTeamFilter && (
          <select
            value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-[12px] text-text-1 outline-none rounded-lg appearance-none"
            style={{ background: '#111812', border: '1px solid #243028', color: teamFilter ? '#E2F2E8' : '#7A9E80' }}
          >
            <option value="">All Teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-[13px] text-text-3">{error}</p>
          <button onClick={() => window.location.reload()} className="text-[12px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-text-3 opacity-40">
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth={1.5} />
            <path d="M16 10v7M16 20v2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
          <p className="text-[13px] text-text-3">
            {hasFilters ? 'No players match your filters' : 'No players registered yet'}
          </p>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setPosFilter(''); setTeamFilter(''); }}
              className="text-[11px] font-mono text-athlon hover:opacity-80">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {/* Grouped by position when no pos filter */}
          {!posFilter ? (
            POS_KEYS.map(pos => (
              <PosSection
                key={pos}
                position={pos}
                players={filtered.filter(p => p.position === pos)}
                onPlayer={id => navigate(`/players/${id}`)}
              />
            ))
          ) : (
            filtered.map(p => (
              <PlayerRow key={p.id} player={p} onClick={() => navigate(`/players/${p.id}`)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
