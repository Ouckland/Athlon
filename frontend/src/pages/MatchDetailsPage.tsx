import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useMatch } from '../hooks/useMatch';
import { useMatchLive } from '../hooks/useMatchLive';
import type { WsStatus } from '../hooks/useWebSocket';
import TeamCrest from '../components/TeamCrest';
import CompetitionBadge from '../components/CompetitionBadge';
import type { Match, MatchEvent, MatchStatus, Team } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'events' | 'lineups';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatKickoff(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function isLiveStatus(s: MatchStatus) {
  return s === 'LIVE';
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function MatchLoadingSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: '#0A0F0C' }}>
      <div className="animate-pulse flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="w-8 h-8 bg-surface-2 rounded" />
        <div className="w-36 h-4 bg-surface-2 rounded" />
        <div className="w-8 h-8 bg-surface-2 rounded" />
      </div>
      <div className="animate-pulse px-4 py-10 border-b border-border" style={{ background: '#0A0F0C' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-surface-2 rounded-xl" />
            <div className="w-20 h-3.5 bg-surface-2 rounded" />
          </div>
          <div className="flex flex-col items-center gap-3 w-32">
            <div className="w-28 h-14 bg-surface-2 rounded" />
            <div className="w-14 h-3 bg-surface-2 rounded" />
          </div>
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-surface-2 rounded-xl" />
            <div className="w-20 h-3.5 bg-surface-2 rounded" />
          </div>
        </div>
      </div>
      <div className="animate-pulse flex gap-6 px-4 py-4 border-b border-border">
        {[72, 56, 64].map((w, i) => (
          <div key={i} className="h-3.5 bg-surface-2 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-surface-1 rounded" />
        ))}
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function MatchErrorState({ onRetry }: { onRetry: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#0A0F0C' }}>
      <svg className="w-10 h-10 text-text-3 mb-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h.01M2 8.82a15 15 0 0120 0M5 12.859a10 10 0 0114 0M8.5 16.429a5 5 0 017 0" />
      </svg>
      <h2 className="font-condensed font-black text-xl tracking-wide text-text-1 mb-2">Unable to load match</h2>
      <p className="text-text-3 text-sm mb-8 max-w-[260px]">
        We couldn't retrieve this match. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="px-6 py-2 rounded font-condensed font-bold tracking-wider text-[12px] text-bg mb-4 hover:opacity-90 transition-opacity"
        style={{ background: '#22C55E' }}
      >
        RETRY
      </button>
      <button onClick={() => navigate(-1)} className="text-[12px] text-text-3 hover:text-text-2 transition-colors">
        Go back
      </button>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 2v9M5.5 5L9 2l3.5 3M5 12H3a1 1 0 00-1 1v2a1 1 0 001 1h12a1 1 0 001-1v-2a1 1 0 00-1-1h-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Live indicator dot ───────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex items-center justify-center w-3 h-3">
      <span className="absolute w-3 h-3 rounded-full animate-live-ring" style={{ background: '#EF4444', opacity: 0.5 }} />
      <span className="relative w-1.5 h-1.5 rounded-full animate-live-pulse" style={{ background: '#EF4444' }} />
    </span>
  );
}

// ─── WS connection indicator ──────────────────────────────────────────────────

function WsIndicator({ status }: { status: WsStatus }) {
  if (status === 'connected') return null; // silent when healthy
  const map: Partial<Record<WsStatus, { label: string; color: string }>> = {
    connecting:   { label: 'Connecting…', color: '#FBBF24' },
    reconnecting: { label: 'Reconnecting…', color: '#FBBF24' },
    error:        { label: 'Connection error', color: '#EF4444' },
    closed:       { label: 'Live updates paused', color: '#40604A' },
  };
  const entry = map[status];
  if (!entry) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
      <span className="font-mono text-[10px] tracking-wide" style={{ color: entry.color }}>{entry.label}</span>
    </div>
  );
}

// ─── Match Header ─────────────────────────────────────────────────────────────

type MatchHeaderProps = {
  match: Match;
  effectiveStatus: MatchStatus;
  effectiveMinute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  wsStatus: WsStatus;
  scoreFlash: boolean;
};

function MatchHeader({ match, effectiveStatus, effectiveMinute, homeScore, awayScore, wsStatus, scoreFlash }: MatchHeaderProps) {
  const navigate = useNavigate();

  const isLive      = isLiveStatus(effectiveStatus);
  const isHT        = effectiveStatus === 'HALFTIME';
  const isFinished  = effectiveStatus === 'FINISHED';
  const isScheduled = effectiveStatus === 'SCHEDULED';

  const homeWon = isFinished && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWon = isFinished && homeScore !== null && awayScore !== null && awayScore > homeScore;

  const stageLabel = match.stage
    ? match.stage.number
      ? `${match.stage.kind_display} ${match.stage.number}`
      : match.stage.name || null
    : null;

  const { time, date } = formatKickoff(match.kickoff_at);

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `${match.home_team.short_name} vs ${match.away_team.short_name}`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }

  return (
    <div>
      {isLive && <div className="h-px w-full" style={{ background: '#EF4444' }} />}
      {isLive && <WsIndicator status={wsStatus} />}

      {/* Competition bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: '1px solid rgba(36,48,40,0.9)',
          background: 'rgba(10,15,12,0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-text-3 hover:text-text-1 transition-colors -ml-0.5"
          aria-label="Go back"
        >
          <IconChevronLeft />
          <span className="text-[12px] font-medium hidden sm:inline">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <CompetitionBadge competition={match.competition} showName size="sm" />
          {stageLabel && (
            <span className="text-[10px] font-mono text-text-3">{stageLabel}</span>
          )}
        </div>

        <button
          onClick={handleShare}
          className="text-text-3 hover:text-text-1 transition-colors"
          aria-label="Share match"
        >
          <IconShare />
        </button>
      </div>

      {/* Scoreboard */}
      <div style={{ background: 'linear-gradient(180deg, #121A0F 0%, #0A0F0C 100%)', borderBottom: '1px solid rgba(36,48,40,0.8)' }}>
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-6">
          <div className="flex items-center gap-3">

            {/* Home team */}
            <div className={`flex-1 flex flex-col items-center gap-3 min-w-0 transition-opacity duration-300 ${isFinished && awayWon ? 'opacity-40' : ''}`}>
              <TeamCrest team={match.home_team} size="xl" />
              <p className="text-[13px] font-semibold text-text-1 text-center leading-tight truncate max-w-full px-1">
                {match.home_team.short_name}
              </p>
            </div>

            {/* Score / kickoff */}
            <div className="flex flex-col items-center flex-shrink-0 w-40 sm:w-48">
              {isScheduled ? (
                <>
                  <p className="font-condensed font-black text-[42px] sm:text-[50px] text-text-1 leading-none tracking-tight">
                    {time}
                  </p>
                  <p className="text-[10px] font-mono text-text-3 mt-2 tracking-wide">{date}</p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span
                      className={`font-condensed font-black leading-none tabular-nums text-[64px] sm:text-[76px] text-text-1 ${scoreFlash ? 'animate-score-flash' : ''}`}
                      style={{ letterSpacing: '-0.03em' }}
                    >
                      {homeScore ?? 0}
                    </span>
                    <span className="font-condensed font-light text-[32px] leading-none" style={{ color: '#344A38' }}>–</span>
                    <span
                      className={`font-condensed font-black leading-none tabular-nums text-[64px] sm:text-[76px] text-text-1 ${scoreFlash ? 'animate-score-flash' : ''}`}
                      style={{ letterSpacing: '-0.03em' }}
                    >
                      {awayScore ?? 0}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {isLive && (
                      <>
                        <LiveDot />
                        <span className="font-mono text-[11px] text-live font-semibold tracking-wider">
                          LIVE{effectiveMinute !== null ? ` · ${effectiveMinute}'` : ''}
                        </span>
                      </>
                    )}
                    {isHT && (
                      <span className="font-condensed font-bold text-[11px] tracking-[0.15em] text-halftime">
                        HALF TIME
                      </span>
                    )}
                    {isFinished && (
                      <span className="font-condensed font-semibold text-[11px] tracking-[0.12em] text-finished">
                        FULL TIME
                      </span>
                    )}
                    {effectiveStatus === 'POSTPONED' && (
                      <span className="font-condensed font-semibold text-[11px] tracking-[0.12em] text-text-3">
                        POSTPONED
                      </span>
                    )}
                    {effectiveStatus === 'CANCELLED' && (
                      <span className="font-condensed font-semibold text-[11px] tracking-[0.12em] text-live">
                        CANCELLED
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Away team */}
            <div className={`flex-1 flex flex-col items-center gap-3 min-w-0 transition-opacity duration-300 ${isFinished && homeWon ? 'opacity-40' : ''}`}>
              <TeamCrest team={match.away_team} size="xl" />
              <p className="text-[13px] font-semibold text-text-1 text-center leading-tight truncate max-w-full px-1">
                {match.away_team.short_name}
              </p>
            </div>
          </div>

          {/* Kickoff date meta */}
          <div className="flex items-center justify-center mt-5">
            <span className="text-[10px] font-mono text-text-3">{date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function MatchTabs({
  active,
  onChange,
  eventCount,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  eventCount: number;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'events',   label: 'Events' },
    { key: 'lineups',  label: 'Lineups' },
  ];

  return (
    <div
      className="sticky top-14 z-10"
      style={{ background: 'rgba(10,15,12,0.97)', borderBottom: '1px solid #243028', backdropFilter: 'blur(8px)' }}
    >
      <div className="max-w-2xl mx-auto flex">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none ${
              active === key ? 'text-text-1' : 'text-text-3 hover:text-text-2'
            }`}
          >
            {label}
            {key === 'events' && eventCount > 0 && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: active === key ? '#22C55E' : '#162019',
                  color: active === key ? '#0A0F0C' : '#7A9E80',
                }}
              >
                {eventCount}
              </span>
            )}
            {active === key && (
              <span className="absolute bottom-0 left-4 right-4 h-px rounded-full" style={{ background: '#22C55E' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED:         'Scheduled',
  LIVE:              'Live',
  HALFTIME:          'Half Time',
  FINISHED:          'Full Time',
  POSTPONED:         'Postponed',
  CANCELLED:         'Cancelled',
};

function MatchOverview({ match, homeScore, awayScore }: { match: Match; homeScore: number | null; awayScore: number | null }) {
  const { time, date } = formatKickoff(match.kickoff_at);

  const infoRows: { label: string; value: string }[] = [
    { label: 'Competition', value: match.competition.name },
    ...(match.stage
      ? [{
          label: 'Stage',
          value: match.stage.number
            ? `${match.stage.kind_display} ${match.stage.number}`
            : match.stage.name || match.stage.kind_display,
        }]
      : []),
    { label: 'Kickoff', value: `${date} · ${time}` },
    { label: 'Status', value: match.status_display || STATUS_LABELS[match.status] },
  ];

  const showResult =
    (match.status === 'FINISHED' || isLiveStatus(match.status) || match.status === 'HALFTIME') &&
    homeScore !== null &&
    awayScore !== null;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
      {showResult && (
        <div
          className="flex items-center justify-between px-5 py-4 rounded-lg"
          style={{ background: '#111812', border: '1px solid #243028' }}
        >
          <span className="text-[13px] font-medium text-text-2">{match.home_team.short_name}</span>
          <span className="font-condensed font-black text-2xl tabular-nums text-text-1">
            {homeScore} – {awayScore}
          </span>
          <span className="text-[13px] font-medium text-text-2">{match.away_team.short_name}</span>
        </div>
      )}

      <div style={{ border: '1px solid #243028', borderRadius: 8, overflow: 'hidden' }}>
        {infoRows.map(({ label, value }, i) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{
              borderTop: i > 0 ? '1px solid rgba(36,48,40,0.6)' : undefined,
              background: i % 2 === 0 ? '#111812' : '#0A0F0C',
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 flex-shrink-0">
              {label}
            </span>
            <span className="text-[12px] text-text-1 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Event icons ──────────────────────────────────────────────────────────────

function GoalCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="6" fill="#FFFFFF" />
      <path d="M7 4v3l1.5 1.5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function YellowCard() {
  return <span className="inline-block w-2.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: '#FBBF24' }} aria-hidden />;
}

function RedCard() {
  return <span className="inline-block w-2.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: '#EF4444' }} aria-hidden />;
}

function SubArrows() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 5.5L7 2l4 3.5" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8.5L7 12l-4-3.5" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  switch (type) {
    case 'GOAL':         return <GoalCircle />;
    case 'YELLOW':       return <YellowCard />;
    case 'RED':          return <RedCard />;
    case 'SUBSTITUTION': return <SubArrows />;
    default:             return null;
  }
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function MatchTimeline({
  events,
  homeTeam,
  awayTeam,
  status,
}: {
  events: MatchEvent[];
  homeTeam: Team;
  awayTeam: Team;
  status: MatchStatus;
}) {
  const isLiveNow = isLiveStatus(status);

  // Filter out meta events (HALFTIME/FULLTIME are structural markers, not rendered as rows)
  const displayEvents = events.filter(e => e.type !== 'HALFTIME' && e.type !== 'FULLTIME');

  if (displayEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <svg className="w-8 h-8 text-text-3 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <p className="text-[13px] text-text-3">
          {isLiveNow ? 'No events yet' : status === 'SCHEDULED' ? 'Match not started' : 'No events recorded'}
        </p>
        {isLiveNow && (
          <p className="text-[11px] font-mono text-text-3 mt-1 opacity-60">Events will appear as the match progresses</p>
        )}
      </div>
    );
  }

  // Backend already orders events by (minute, created_at) — display newest first
  const sorted = [...displayEvents].reverse();

  type Row = { kind: 'event'; event: MatchEvent; isNewest: boolean } | { kind: 'divider' };
  const rows: Row[] = [];
  let htInserted = false;

  sorted.forEach((event, i) => {
    rows.push({ kind: 'event', event, isNewest: i === 0 && isLiveNow });
    const next = sorted[i + 1];
    // Insert HT divider between 2nd-half and 1st-half events
    if (!htInserted && next && event.minute > 45 && next.minute <= 45) {
      rows.push({ kind: 'divider' });
      htInserted = true;
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Column headers */}
      <div
        className="grid gap-0 px-4 py-2.5"
        style={{ gridTemplateColumns: '1fr 72px 1fr', borderBottom: '1px solid #243028' }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
          {homeTeam.abbreviation}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3 text-center">Min</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3 text-right">
          {awayTeam.abbreviation}
        </span>
      </div>

      {rows.map((row, i) => {
        if (row.kind === 'divider') {
          return (
            <div key={`ht-${i}`} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(36,48,40,0.5)' }}>
              <div className="flex-1 h-px" style={{ background: 'rgba(36,48,40,0.5)' }} />
              <span className="font-condensed font-bold text-[10px] tracking-[0.14em] text-halftime flex-shrink-0">
                HALF TIME
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(36,48,40,0.5)' }} />
            </div>
          );
        }

        const { event, isNewest } = row;
        const isHome = event.team.id === homeTeam.id;
        const isGoal = event.type === 'GOAL';
        const playerName = event.player?.display_name ?? '—';
        const relatedName = event.related_player?.display_name;

        const playerCell = (
          <div className={`flex flex-col gap-0.5 ${isHome ? '' : 'items-end'}`}>
            <span className="text-[12px] font-medium text-text-1 leading-snug">{playerName}</span>
            {event.type === 'SUBSTITUTION' && relatedName && (
              <span className="text-[10px] font-mono text-text-3 leading-snug">
                ↑ {relatedName}
              </span>
            )}
            {isGoal && relatedName && (
              <span className="text-[10px] font-mono text-text-3 leading-snug">
                A: {relatedName}
              </span>
            )}
            <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-text-3">
              {event.type_display}
            </span>
          </div>
        );

        return (
          <div
            key={event.id}
            className={`grid items-center gap-2 px-4 py-3 ${isNewest ? 'animate-fade-up' : ''}`}
            style={{
              gridTemplateColumns: '1fr 72px 1fr',
              borderBottom: '1px solid rgba(36,48,40,0.4)',
              background: isGoal ? 'rgba(34,197,94,0.04)' : 'transparent',
            }}
          >
            {isHome ? playerCell : <div />}
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-mono text-[10px] text-text-3 tabular-nums">{event.minute}'</span>
              <EventIcon type={event.type} />
            </div>
            {!isHome ? playerCell : <div />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lineup Panel ─────────────────────────────────────────────────────────────

function LineupPanel({ homeTeam, awayTeam }: { homeTeam: Team; awayTeam: Team }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Home', team: homeTeam },
          { label: 'Away', team: awayTeam },
        ].map(({ label, team }) => (
          <div
            key={label}
            className="px-4 py-3 rounded-lg"
            style={{ background: '#111812', border: '1px solid #243028' }}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 mb-1">{label}</p>
            <div className="flex items-center gap-2">
              <TeamCrest team={team} size="xs" />
              <p className="text-[12px] font-medium text-text-1 truncate">{team.short_name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center py-14 text-center">
        <svg className="w-8 h-8 text-text-3 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20v-2a6 6 0 0112 0v2" />
        </svg>
        <p className="text-[13px] text-text-2 mb-1">Lineups not yet announced</p>
        <p className="text-[11px] font-mono text-text-3">Check back closer to kick-off</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchDetailsPage() {
  const { matchId: matchIdParam } = useParams<{ matchId: string }>();
  const matchId = matchIdParam ? parseInt(matchIdParam, 10) : null;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { match: apiMatch, events: apiEvents, isLoading, error, refetch } = useMatch(matchId);

  // Refresh REST match and event data whenever the backend sends a recognized notification.
  const handleWsEvent = useCallback(() => { refetch(); }, [refetch]);
  const match: Match | null = apiMatch;
  const isLive = match?.status === 'LIVE';
  const { wsStatus } = useMatchLive(matchId, isLive, handleWsEvent);

  const allEvents: MatchEvent[] = apiEvents;

  const effectiveStatus: MatchStatus = match?.status ?? 'SCHEDULED';
  const effectiveMinute: number | null = match?.minute ?? null;
  const homeScore: number | null = match?.home_score ?? null;
  const awayScore: number | null = match?.away_score ?? null;

  // Flash score digits briefly when the score changes via WebSocket
  const prevHomeRef = useRef(homeScore);
  const prevAwayRef = useRef(awayScore);
  const [scoreFlash, setScoreFlash] = useState(false);
  useEffect(() => {
    if (homeScore !== prevHomeRef.current || awayScore !== prevAwayRef.current) {
      prevHomeRef.current = homeScore;
      prevAwayRef.current = awayScore;
      setScoreFlash(true);
      const t = setTimeout(() => setScoreFlash(false), 750);
      return () => clearTimeout(t);
    }
  }, [homeScore, awayScore]);

  if (isLoading && !match) return <MatchLoadingSkeleton />;
  if (!match) return <MatchErrorState onRetry={refetch} />;

  return (
    <div className="min-h-screen" style={{ background: '#0A0F0C' }}>
      <MatchHeader
        match={match}
        effectiveStatus={effectiveStatus}
        effectiveMinute={effectiveMinute}
        homeScore={homeScore}
        awayScore={awayScore}
        wsStatus={wsStatus}
        scoreFlash={scoreFlash}
      />

      <MatchTabs active={activeTab} onChange={setActiveTab} eventCount={allEvents.length} />

      <div className="pb-10">
        {activeTab === 'overview' && (
          <MatchOverview match={match} homeScore={homeScore} awayScore={awayScore} />
        )}
        {activeTab === 'events' && (
          <MatchTimeline
            events={allEvents}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
            status={effectiveStatus}
          />
        )}
        {activeTab === 'lineups' && (
          <LineupPanel homeTeam={match.home_team} awayTeam={match.away_team} />
        )}
      </div>

    </div>
  );
}
