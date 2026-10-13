import type { Match } from '../lib/types';
import TeamCrest from './TeamCrest';
import CompetitionBadge from './CompetitionBadge';
import LiveBadge from './LiveBadge';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  match: Match;
  onPress?: () => void;
};

function GoalDot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#40604A', marginTop: 3 }} />;
}

export default function FixtureCard({ match, onPress }: Props) {
  const isLive     = match.status === 'LIVE';
  const isHT       = match.status === 'HALFTIME';
  const isFinished = match.status === 'FINISHED';
  const isOther    = match.status === 'POSTPONED' || match.status === 'CANCELLED';
  const hasScore   = match.home_score != null && match.away_score != null;

  const homeWin = isFinished && match.home_score! > match.away_score!;
  const awayWin = isFinished && match.away_score! > match.home_score!;

  const showGoals = false; // goal scorer details require separate events fetch

  const stageLabel = match.stage?.number ? `GW${match.stage.number}` : match.stage?.name ?? null;

  /* Status strip color — top border only, thin */
  const topBorderColor = isLive ? '#EF4444' : isHT ? '#FBBF24' : '#243028';

  return (
    <button
      onClick={onPress}
      className="w-full text-left overflow-hidden group active:scale-[0.996] transition-transform duration-100"
      style={{
        background: '#111812',
        border: '1px solid #243028',
        borderTop: `2px solid ${topBorderColor}`,
        borderRadius: 8,
      }}
    >
      {/* Header strip: competition + status */}
      <div
        className="flex items-center justify-between px-3.5 py-1.5"
        style={{ borderBottom: '1px solid #243028' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CompetitionBadge competition={match.competition} />
          {stageLabel && (
            <span className="text-[10px] font-mono" style={{ color: '#40604A' }}>{stageLabel}</span>
          )}
        </div>

        <div className="flex-shrink-0 ml-2">
          {isLive ? (
            <LiveBadge minute={match.minute!} size="sm" />
          ) : isHT ? (
            <span className="text-[10px] font-condensed font-bold tracking-wider" style={{ color: '#FBBF24' }}>HT</span>
          ) : isFinished ? (
            <span className="text-[10px] font-mono" style={{ color: '#4B6A54' }}>FT</span>
          ) : isOther ? (
              <span className="text-[10px] font-mono italic" style={{ color: '#40604A' }}>
              {match.status === 'POSTPONED' ? 'PPD' : 'CAN'}
            </span>
          ) : (
            <span className="font-mono text-[12px] font-medium text-text-2">
              {formatTime(match.kickoff_at)}
            </span>
          )}
        </div>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center gap-2 px-3.5 py-3">
        {/* Home team */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <TeamCrest team={match.home_team} size="sm" />
          <p
            className="text-[13px] font-medium leading-snug truncate"
            style={{ color: homeWin ? '#E2F2E8' : isFinished ? '#7A9E80' : '#E2F2E8', fontWeight: homeWin ? 600 : 500 }}
          >
            {match.home_team.short_name}
          </p>
        </div>

        {/* Score / kickoff */}
        <div className="flex-shrink-0 px-1 text-center" style={{ minWidth: 64 }}>
          {hasScore ? (
            <div className="flex items-center justify-center gap-1.5">
              <span
                className={`font-condensed font-black text-[24px] tabular-nums leading-none ${isLive ? 'animate-score-flash' : ''}`}
                style={{
                  color: homeWin ? '#E2F2E8' : awayWin ? '#4B6A54' : '#E2F2E8',
                  letterSpacing: '-0.02em',
                }}
              >
                {match.home_score}
              </span>
              <span className="font-condensed text-base font-light leading-none" style={{ color: '#344A38' }}>–</span>
              <span
                className="font-condensed font-black text-[24px] tabular-nums leading-none"
                style={{
                  color: awayWin ? '#E2F2E8' : homeWin ? '#4B6A54' : '#E2F2E8',
                  letterSpacing: '-0.02em',
                }}
              >
                {match.away_score}
              </span>
            </div>
          ) : isOther ? (
            <span className="font-mono text-xs" style={{ color: '#40604A' }}>—</span>
          ) : (
            <span className="font-condensed font-semibold text-[10px] tracking-[0.18em]" style={{ color: '#40604A' }}>VS</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
          <p
            className="text-[13px] font-medium leading-snug truncate text-right"
            style={{ color: awayWin ? '#E2F2E8' : isFinished ? '#7A9E80' : '#E2F2E8', fontWeight: awayWin ? 600 : 500 }}
          >
            {match.away_team.short_name}
          </p>
          <TeamCrest team={match.away_team} size="sm" />
        </div>
      </div>

    </button>
  );
}
