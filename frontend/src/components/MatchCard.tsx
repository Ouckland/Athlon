import type { Match } from '../lib/types';
import TeamCrest from './TeamCrest';

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getStatusDisplay(match: Match): { text: string; color: string; isLive: boolean } {
  switch (match.status) {
    case 'LIVE':
      return {
        text: `${match.minute}'`,
        color: '#EF4444',
        isLive: true,
      };
    case 'HALFTIME':  return { text: 'HT',  color: '#FBBF24', isLive: false };
    case 'FINISHED':  return { text: 'FT',  color: '#4B6A54', isLive: false };
    case 'POSTPONED': return { text: 'PPD', color: '#40604A', isLive: false };
    case 'CANCELLED': return { text: 'CAN', color: '#40604A', isLive: false };
    default:          return { text: formatKickoff(match.kickoff_at), color: '#7A9E80', isLive: false };
  }
}

type Props = {
  match: Match;
  showDate?: boolean;
  onClick?: () => void;
};

export default function MatchCard({ match, onClick }: Props) {
  const { text, color, isLive } = getStatusDisplay(match);
  const isFinished = match.status === 'FINISHED';
  const hasScore   = match.home_score != null && match.away_score != null;
  const homeWin    = isFinished && match.home_score! > match.away_score!;
  const awayWin    = isFinished && match.away_score! > match.home_score!;

  return (
    <div
      className="flex items-center h-12 px-4 border-b cursor-pointer match-row-hover"
      style={{
        borderBottomColor: '#243028',
        borderLeft: `2px solid ${isLive ? '#EF4444' : 'transparent'}`,
      }}
      onClick={onClick}
    >
      {/* Status column */}
      <div className="w-14 flex-shrink-0 flex flex-col items-end gap-0.5">
        {isLive ? (
          <>
            <span className="relative flex items-center justify-end">
              <span
                className="absolute inline-flex rounded-full animate-live-ring"
                style={{ width: 7, height: 7, background: '#EF4444', opacity: 0.6 }}
              />
              <span
                className="relative inline-flex rounded-full animate-live-pulse"
                style={{ width: 5, height: 5, background: '#EF4444' }}
              />
            </span>
            <span className="text-[10px] font-mono leading-none" style={{ color }}>{text}</span>
          </>
        ) : (
          <span className="text-[11px] font-mono" style={{ color }}>{text}</span>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center gap-2 flex-1 min-w-0 ml-3">
        <TeamCrest team={match.home_team} size="xs" />
        <span
          className={`text-[13px] truncate ${
            homeWin ? 'font-semibold text-text-1' : isFinished ? 'text-text-2' : 'font-medium text-text-1'
          }`}
        >
          {match.home_team.short_name}
        </span>
      </div>

      {/* Score / vs */}
      <div className="flex-shrink-0 flex items-center justify-center px-2" style={{ minWidth: 62 }}>
        {hasScore ? (
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-condensed font-black text-[20px] tabular-nums leading-none ${
                homeWin ? 'text-text-1' : awayWin ? 'text-text-2' : 'text-text-1'
              } ${isLive ? 'animate-score-flash' : ''}`}
              style={{ letterSpacing: '-0.02em' }}
            >
              {match.home_score}
            </span>
            <span className="font-condensed font-light text-sm leading-none" style={{ color: '#344A38' }}>–</span>
            <span
              className={`font-condensed font-black text-[20px] tabular-nums leading-none ${
                awayWin ? 'text-text-1' : homeWin ? 'text-text-2' : 'text-text-1'
              }`}
              style={{ letterSpacing: '-0.02em' }}
            >
              {match.away_score}
            </span>
          </div>
        ) : (
          <span className="font-condensed text-[10px] font-semibold text-text-3 tracking-widest">VS</span>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end mr-0">
        <span
          className={`text-[13px] truncate text-right ${
            awayWin ? 'font-semibold text-text-1' : isFinished ? 'text-text-2' : 'font-medium text-text-1'
          }`}
        >
          {match.away_team.short_name}
        </span>
        <TeamCrest team={match.away_team} size="xs" />
      </div>
    </div>
  );
}
