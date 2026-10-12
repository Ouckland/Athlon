import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { ApiPlayer } from '../lib/types';

// ─── Position palette ─────────────────────────────────────────────────────────

const POS: Record<string, { color: string; label: string }> = {
  GK:  { color: '#FBBF24', label: 'Goalkeeper' },
  DEF: { color: '#3B82F6', label: 'Defender' },
  MID: { color: '#22C55E', label: 'Midfielder' },
  ATT: { color: '#EF4444', label: 'Attacker' },
};

// ─── Avatar hero ──────────────────────────────────────────────────────────────

function PlayerPhoto({ player, sizePx = 96 }: { player: ApiPlayer; sizePx?: number }) {
  const [err, setErr] = useState(false);
  const color = POS[player.position]?.color ?? '#7A9E80';
  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase();

  if (!player.photo || err) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center flex-shrink-0 font-condensed font-black select-none"
        style={{
          width: sizePx, height: sizePx,
          background: color + '18',
          border: `2px solid ${color}35`,
          fontSize: Math.round(sizePx * 0.36),
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
      className="rounded-2xl object-cover object-top flex-shrink-0"
      style={{ width: sizePx, height: sizePx, border: '1.5px solid #243028' }}
    />
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-xl mx-auto px-4 pt-4 pb-24 animate-pulse">
      <div className="w-14 h-3 bg-surface-2 rounded mb-5" />
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#111812', border: '1px solid #243028', height: 180 }} />
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} className="flex justify-between px-4 py-3" style={{ background: i % 2 === 0 ? '#111812' : '#0A0F0C', borderTop: i > 0 ? '1px solid rgba(36,48,40,0.5)' : undefined }}>
            <div className="w-20 h-2.5 bg-surface-3 rounded" />
            <div className="w-28 h-2.5 bg-surface-3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const id = playerId ? parseInt(playerId, 10) : null;

  const [player, setPlayer]     = useState<ApiPlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  function load() {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    api.get<ApiPlayer>(API_PATHS.players.detail(id))
      .then(data => setPlayer(data))
      .catch(() => setError('Failed to load player'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  if (isLoading) return <Skeleton />;

  if (error || !player) {
    return (
      <div className="max-w-xl mx-auto px-4 py-4 pb-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
          Players
        </button>
        <div className="flex flex-col items-center gap-3 py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[13px] font-mono" style={{ color: '#EF4444' }}>{error ?? 'Player not found'}</p>
          <button onClick={load} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      </div>
    );
  }

  const posCfg = POS[player.position] ?? { color: '#7A9E80', label: player.position_display };
  const posColor = posCfg.color;

  const infoRows: { label: string; value: ReactNode }[] = [
    { label: 'Full Name',    value: `${player.first_name} ${player.last_name}` },
    { label: 'Display Name', value: player.display_name },
    { label: 'Position',     value: player.position_display },
    ...(player.shirt_number != null ? [{ label: 'Shirt Number', value: `#${player.shirt_number}` }] : []),
    ...(player.team ? [{
      label: 'Team',
      value: (
        <button
          onClick={() => navigate(`/teams/${player.team!.id}`)}
          className="font-mono text-athlon hover:opacity-80 transition-opacity text-right leading-tight"
          style={{ fontSize: 12 }}
        >
          {player.team.name} →
        </button>
      ),
    }] : []),
  ];

  return (
    <div className="max-w-xl mx-auto px-4 pt-4 pb-24 animate-fade-in">
      {/* Back nav */}
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M8 2L4 6l4 4" />
        </svg>
        Players
      </button>

      {/* ── Hero ── */}
      <div
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{
          background: `linear-gradient(135deg, #111812 0%, ${posColor}0D 100%)`,
          border: `1px solid ${posColor}25`,
        }}
      >
        {/* Top accent bar */}
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${posColor} 0%, transparent 70%)` }} />

        {/* Background shirt number watermark */}
        {player.shirt_number != null && (
          <span
            aria-hidden
            className="absolute right-4 top-1/2 -translate-y-1/2 font-condensed font-black tabular-nums select-none pointer-events-none leading-none"
            style={{ fontSize: 112, color: posColor, opacity: 0.06, lineHeight: 1 }}
          >
            {player.shirt_number}
          </span>
        )}

        <div className="relative z-10 flex items-end gap-5 px-5 pt-6 pb-5">
          <PlayerPhoto player={player} sizePx={96} />

          <div className="flex-1 min-w-0 pb-1">
            {/* Position badge */}
            <span
              className="inline-flex items-center font-condensed font-bold tracking-[0.15em] text-[10px] mb-2 leading-none"
              style={{
                padding: '3px 8px 3px 7px',
                borderRadius: 4,
                background: posColor + '20',
                color: posColor,
                border: `1px solid ${posColor}35`,
              }}
            >
              {player.position}
            </span>

            {/* Display name */}
            <h1 className="font-condensed font-black text-[28px] sm:text-[32px] text-text-1 tracking-tight leading-[1.05] break-words">
              {player.display_name}
            </h1>

            {/* Team link */}
            {player.team && (
              <button
                onClick={() => navigate(`/teams/${player.team!.id}`)}
                className="flex items-center gap-1 mt-1.5 text-[11px] font-mono text-text-3 hover:text-athlon transition-colors group"
              >
                <span>{player.team.name}</span>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
                  className="group-hover:translate-x-0.5 transition-transform">
                  <path d="M2 1.5h5.5v5.5M7.5 1.5L1.5 7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Shirt number badge — bottom right */}
          {player.shirt_number != null && (
            <div
              className="flex-shrink-0 self-start mt-1 w-10 h-10 rounded-xl flex items-center justify-center font-condensed font-black text-[18px] tabular-nums leading-none"
              style={{
                background: posColor + '18',
                border: `1.5px solid ${posColor}35`,
                color: posColor,
              }}
            >
              {player.shirt_number}
            </div>
          )}
        </div>
      </div>

      {/* ── Info table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
        <div className="px-4 py-2.5 border-b" style={{ background: '#0A0F0C', borderBottomColor: '#243028' }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-3">Player Info</span>
        </div>
        {infoRows.map(({ label, value }, i) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{
              background: i % 2 === 0 ? '#111812' : '#0A0F0C',
              borderTop: '1px solid rgba(36,48,40,0.5)',
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 flex-shrink-0">{label}</span>
            <span className="text-[12px] text-text-1 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
