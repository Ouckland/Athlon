import type { Competition } from '../lib/types';

// Muted league identity colors — toned down to work within dark graphite UI.
// Uses low-opacity tinted backgrounds with desaturated text rather than raw league neon.
const COMP_COLORS: Record<string, { bg: string; text: string }> = {
  PL:  { bg: 'rgba(120,52,196,0.18)',  text: '#C084FC' }, // Premier League — purple
  UCL: { bg: 'rgba(37,99,235,0.15)',   text: '#93C5FD' }, // Champions League — blue
  LL:  { bg: 'rgba(234,88,12,0.15)',   text: '#FB923C' }, // La Liga — orange
  BL:  { bg: 'rgba(220,38,38,0.15)',   text: '#FCA5A5' }, // Bundesliga — red
  SA:  { bg: 'rgba(30,64,175,0.15)',   text: '#93C5FD' }, // Serie A — blue
  L1:  { bg: 'rgba(7,89,133,0.15)',    text: '#7DD3FC' }, // Ligue 1 — sky blue
};

type Props = {
  competition: Competition;
  showName?: boolean;
  size?: 'sm' | 'md';
};

export default function CompetitionBadge({ competition, showName = false, size = 'sm' }: Props) {
  const colors = COMP_COLORS[competition.code] ?? { bg: 'rgba(35,37,46,0.8)', text: '#828CA4' };
  const isSm = size === 'sm';

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center font-condensed font-bold tracking-wider ${isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}
        style={{
          background: colors.bg,
          color: colors.text,
          borderRadius: 3,
        }}
      >
        {competition.code}
      </span>
      {showName && (
        <span className={`text-text-2 font-medium ${isSm ? 'text-xs' : 'text-sm'}`}>
          {competition.short_name}
        </span>
      )}
    </div>
  );
}
