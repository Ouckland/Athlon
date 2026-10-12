import type { MatchEvent } from '../lib/types';

type Props = {
  events: MatchEvent[];
};

const EVENT_ICONS: Partial<Record<string, string>> = {
  GOAL:         '⚽',
  YELLOW:       '🟨',
  RED:          '🟥',
  SUBSTITUTION: '↔',
};

function EventRow({ event }: { event: MatchEvent }) {
  const isHome = typeof event.team === 'object' ? true : false; // rendered by caller
  const icon = EVENT_ICONS[event.type] ?? '•';

  return (
    <div className={`flex items-center gap-3 py-2 px-4 hover:bg-surface-1 transition-colors ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`flex-1 min-w-0 ${isHome ? 'text-left' : 'text-right'}`}>
        <p className="text-sm font-medium text-text-1 truncate">{event.player?.display_name ?? '—'}</p>
        {event.type === 'SUBSTITUTION' && (
          <p className="text-xs text-text-3 truncate">↑ {event.related_player?.display_name ?? '—'}</p>
        )}
      </div>
      <div className="flex flex-col items-center flex-shrink-0 w-20 gap-0.5">
        <span className="font-mono text-[11px] text-text-3 leading-none">{event.minute}'</span>
        <span className="text-base leading-none">{icon}</span>
      </div>
      <div className="flex-1" />
    </div>
  );
}

export default function MatchTimeline({ events }: Props) {
  if (!events.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-text-3">No events yet</p>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => b.minute - a.minute);

  return (
    <div className="flex flex-col divide-y" style={{ borderColor: '#23252E' }}>
      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-condensed font-semibold text-text-3 tracking-widest">
        <span>HOME</span>
        <span>EVENT</span>
        <span>AWAY</span>
      </div>
      {sorted.map((event, i) => (
        <EventRow key={event.id ?? i} event={event} />
      ))}
    </div>
  );
}
