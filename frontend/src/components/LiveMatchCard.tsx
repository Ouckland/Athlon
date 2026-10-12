import type { Match } from '../lib/types';
import TeamCrest from './TeamCrest';
import LiveBadge from './LiveBadge';
import CompetitionBadge from './CompetitionBadge';

type Props = {
  match: Match;
  featured?: boolean;
  onClick?: () => void;
};

function GoalDot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#40604A', marginTop: 3 }} />;
}

function GoalScorers() {
  return null; // goal scorer details require a separate events fetch
}

export default function LiveMatchCard({ match, featured = false, onClick }: Props) {
  const stageLabel = match.stage?.number ? `GW${match.stage.number}` : match.stage?.name ?? null;

  return (
    <div
      className="flex flex-col overflow-hidden transition-all duration-200 cursor-pointer select-none"
      style={{
        background: featured ? '#162019' : '#111812',
        border: '1px solid #243028',
        borderTop: '2px solid #EF4444',
        borderRadius: 8,
        boxShadow: featured ? '0 4px 40px rgba(0,0,0,0.5)' : '0 1px 8px rgba(0,0,0,0.25)',
      }}
      onClick={onClick}
    >
      {/* Header: live badge + competition */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid #243028' }}
      >
        <LiveBadge minute={match.minute!} size="sm" />
        <div className="flex items-center gap-2">
          <CompetitionBadge competition={match.competition} showName={featured} />
          {stageLabel && !featured && (
            <span className="text-[10px] font-mono" style={{ color: '#40604A' }}>{stageLabel}</span>
          )}
          {stageLabel && featured && (
            <span className="text-[11px] font-mono text-text-3">{stageLabel}</span>
          )}
        </div>
      </div>

      {/* Score block */}
      <div className={`flex items-center justify-between gap-4 ${featured ? 'px-7 py-6' : 'px-4 py-4'}`}>
        {/* Home */}
        <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
          <TeamCrest team={match.home_team} size={featured ? 'lg' : 'md'} />
          <p className={`font-medium text-center leading-tight truncate max-w-full ${featured ? 'text-[13px] text-text-1' : 'text-[11px] text-text-2'}`}>
            {featured ? match.home_team.short_name : match.home_team.abbreviation}
          </p>
        </div>

        {/* Score */}
        <div className="flex items-baseline gap-2 flex-shrink-0">
          <span
            className={`font-condensed font-black tabular-nums leading-none text-text-1 ${featured ? 'text-[64px]' : 'text-[46px]'}`}
            style={{ letterSpacing: '-0.02em' }}
          >
            {match.home_score ?? 0}
          </span>
          <span
            className={`font-condensed font-light leading-none ${featured ? 'text-[28px]' : 'text-[22px]'}`}
            style={{ color: '#344A38' }}
          >
            –
          </span>
          <span
            className={`font-condensed font-black tabular-nums leading-none text-text-1 ${featured ? 'text-[64px]' : 'text-[46px]'}`}
            style={{ letterSpacing: '-0.02em' }}
          >
            {match.away_score ?? 0}
          </span>
        </div>

        {/* Away */}
        <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
          <TeamCrest team={match.away_team} size={featured ? 'lg' : 'md'} />
          <p className={`font-medium text-center leading-tight truncate max-w-full ${featured ? 'text-[13px] text-text-1' : 'text-[11px] text-text-2'}`}>
            {featured ? match.away_team.short_name : match.away_team.abbreviation}
          </p>
        </div>
      </div>

      {/* Goal scorers — featured only */}
      {featured && <GoalScorers />}

      {/* Footer CTA */}
      <div
        className="flex items-center justify-center gap-1.5 py-2.5 transition-colors duration-150"
        style={{
          borderTop: '1px solid #243028',
          color: '#40604A',
        }}
      >
        <span className={`font-mono tracking-wide ${featured ? 'text-[11px]' : 'text-[10px]'}`}>
          Match centre
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M3 2l4 3-4 3" />
        </svg>
      </div>
    </div>
  );
}
