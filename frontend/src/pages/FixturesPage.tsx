import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { Match, Competition } from '../lib/types';
import { usePublicMatches } from '../hooks/useMatches';
import FixtureCard from '../components/FixtureCard';
import LiveMatchCard from '../components/LiveMatchCard';
import CompetitionBadge from '../components/CompetitionBadge';
import SectionHeader from '../components/SectionHeader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function generateDates(back: number, forward: number): Date[] {
  const result: Date[] = [];
  const today = new Date();
  for (let i = -back; i <= forward; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    result.push(d);
  }
  return result;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Date Navigator ───────────────────────────────────────────────────────────

type DateNavigatorProps = {
  selected: Date;
  onSelect: (d: Date) => void;
  datesWithLive?: string[];
};

function DateNavigator({ selected, onSelect, datesWithLive = [] }: DateNavigatorProps) {
  const today = new Date();
  const dates = generateDates(3, 7);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  return (
    <div
      className="sticky z-40 border-b"
      style={{
        top: 56,
        background: 'rgba(10,15,12,0.96)',
        borderColor: '#243028',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {dates.map((date) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selected);
          const isYesterday = isSameDay(date, (() => { const d = new Date(today); d.setDate(d.getDate()-1); return d; })());
          const hasLive = datesWithLive.includes(date.toDateString());

          return (
            <button
              key={date.toISOString()}
              ref={isToday ? todayRef : undefined}
              onClick={() => onSelect(date)}
              className="flex-shrink-0 flex flex-col items-center gap-0.5 rounded-lg transition-all duration-200 active:scale-95"
              style={{
                scrollSnapAlign: 'start',
                minWidth: 60,
                padding: '10px 8px',
                background: isSelected ? '#22C55E' : '#111812',
                border: `1px solid ${isSelected ? '#22C55E' : '#243028'}`,
              }}
            >
              <span
                className={`text-[9px] font-condensed font-bold tracking-widest uppercase ${
                  isSelected ? 'text-bg' : isToday ? 'text-athlon' : 'text-text-3'
                }`}
              >
                {isToday ? 'Today' : isYesterday ? 'Yest' : DAYS[date.getDay()]}
              </span>
              <span
                className={`font-condensed font-black text-xl leading-tight ${
                  isSelected ? 'text-bg' : 'text-text-1'
                }`}
              >
                {date.getDate()}
              </span>
              <span
                className={`text-[9px] font-mono ${
                  isSelected ? 'text-bg/70' : 'text-text-3'
                }`}
              >
                {MONTHS[date.getMonth()]}
              </span>
              {hasLive && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-live mt-0.5 animate-live-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fixtures Hero ────────────────────────────────────────────────────────────

function FixturesHero({ liveCount, todayCount }: { liveCount: number; todayCount: number }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div
      className="pt-6 pb-4 px-4 sm:px-6 border-b"
      style={{
        background: 'linear-gradient(160deg, #111812 0%, #0A0F0C 100%)',
        borderColor: '#243028',
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-condensed font-bold text-text-3 tracking-[0.25em] uppercase mb-1">
              ATHLON
            </p>
            <h1 className="font-condensed font-black text-3xl sm:text-4xl text-text-1 tracking-tight uppercase leading-none mb-1">
              Fixtures
            </h1>
            <p className="text-sm text-text-2 font-medium leading-snug">
              Match Centre
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {liveCount > 0 && (
              <div className="flex items-center gap-2 bg-live/10 border border-live/25 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-live animate-live-pulse" />
                <span className="font-condensed font-bold text-sm text-live tracking-wider">
                  {liveCount} LIVE
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-border bg-surface-1">
              <svg className="w-3 h-3 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[11px] font-mono text-text-2">{todayCount} today</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] font-mono text-text-3 mt-3">{dateStr}</p>
      </div>
    </div>
  );
}

// ─── Live Now Section ─────────────────────────────────────────────────────────

function LiveNowSection({ matches }: { matches: Match[] }) {
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const navigate = useNavigate();
  const featured = matches[featuredIdx];

  return (
    <section className="animate-fade-up px-4 sm:px-6 pt-6 pb-2 max-w-4xl mx-auto">
      <SectionHeader title="Live Now" subtitle={`${matches.length} in progress`} accent />

      {/* Desktop: featured + compact sidebar */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 cursor-pointer" onClick={() => navigate(`/matches/${featured.id}`)}>
          <LiveMatchCard match={featured} featured />
        </div>
        <div className="flex flex-col gap-3">
          {matches
            .filter((_, i) => i !== featuredIdx)
            .map((m) => (
              <button key={m.id} onClick={() => setFeaturedIdx(matches.indexOf(m))} className="text-left w-full">
                <LiveMatchCard match={m} featured={false} />
              </button>
            ))}
          {matches.length === 1 && (
            <div className="flex-1 rounded-lg border border-border bg-surface-1 flex items-center justify-center p-6">
              <p className="text-text-3 text-xs font-mono text-center">One match live</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: horizontal snap scroll */}
      <div className="sm:hidden">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1" style={{ scrollSnapType: 'x mandatory' }}>
          {matches.map((m) => (
            <div key={m.id} style={{ scrollSnapAlign: 'start', minWidth: '88vw', maxWidth: 380 }}
              onClick={() => navigate(`/matches/${m.id}`)} className="cursor-pointer">
              <LiveMatchCard match={m} featured />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Competition Group ────────────────────────────────────────────────────────

function CompetitionGroup({
  competition,
  matches,
  delay = 0,
}: {
  competition: Competition;
  matches: Match[];
  delay?: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="animate-fade-up mb-4" style={{ animationDelay: `${delay}ms` }}>
      {/* Group header */}
      <div className="flex items-center gap-3 mb-2.5 px-1">
        <CompetitionBadge competition={competition} showName />
        <div className="flex-1 h-px" style={{ background: '#243028' }} />
        <span className="text-[10px] font-mono text-text-3 flex-shrink-0">
          {matches.length} match{matches.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {matches.map((match) => (
          <FixtureCard key={match.id} match={match} onPress={() => navigate(`/matches/${match.id}`)} />
        ))}
      </div>
    </div>
  );
}

// ─── Matches By Date ──────────────────────────────────────────────────────────

function MatchesByDate({ matches, label }: { matches: Match[]; label: string }) {
  if (matches.length === 0) return null;

  const grouped = matches.reduce(
    (acc, match) => {
      const key = match.competition.code;
      if (!acc[key]) acc[key] = { competition: match.competition, matches: [] };
      acc[key].matches.push(match);
      return acc;
    },
    {} as Record<string, { competition: Competition; matches: Match[] }>,
  );

  return (
    <section className="px-4 sm:px-6 pt-5 pb-2 max-w-4xl mx-auto">
      <SectionHeader title={label} accent />
      {Object.values(grouped).map(({ competition, matches: ms }, i) => (
        <CompetitionGroup key={competition.code} competition={competition} matches={ms} delay={i * 60} />
      ))}
    </section>
  );
}

// ─── Upcoming Section (date grouped, future days) ────────────────────────────

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ date }: { date: Date }) {
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 gap-4 max-w-4xl mx-auto">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ background: '#111812', border: '1px solid #23252E' }}
      >
        {isPast ? '🏁' : '📅'}
      </div>
      <div className="text-center">
        <p className="font-condensed font-bold text-lg text-text-1 uppercase tracking-wide mb-1">
          {isPast ? 'No results found' : 'No fixtures yet'}
        </p>
        <p className="text-sm text-text-3 font-mono max-w-xs leading-relaxed">
          {isPast
            ? 'No matches were recorded for this date.'
            : 'No fixtures have been scheduled for this date.'}
        </p>
      </div>
      <div className="flex gap-2 mt-1">
        {['Today', 'Tomorrow'].map((l) => (
          <span key={l} className="text-xs font-medium text-text-2 border border-border rounded-lg px-3 py-1.5 bg-surface-1">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ background: '#111812' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#162019', background: '#0A0F0C' }}>
        <div className="w-16 h-4 rounded bg-surface-3 animate-pulse" />
        <div className="w-10 h-4 rounded bg-surface-3 animate-pulse" />
      </div>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="flex-1 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-surface-3 animate-pulse flex-shrink-0" />
          <div className="w-24 h-4 rounded bg-surface-3 animate-pulse" />
        </div>
        <div className="w-16 h-8 rounded bg-surface-3 animate-pulse" />
        <div className="flex-1 flex items-center gap-2.5 justify-end">
          <div className="w-24 h-4 rounded bg-surface-3 animate-pulse" />
          <div className="w-8 h-8 rounded-md bg-surface-3 animate-pulse flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="px-4 sm:px-6 pt-5 max-w-4xl mx-auto">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

// ─── Status Filter Bar ────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'LIVE' | 'FINISHED' | 'SCHEDULED';

function StatusFilterBar({ active, onChange, counts }: {
  active: StatusFilter;
  onChange: (f: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'LIVE', label: 'Live' },
    { key: 'FINISHED', label: 'Results' },
    { key: 'SCHEDULED', label: 'Upcoming' },
  ];

  return (
    <div className="flex gap-2 px-4 sm:px-6 pt-4 pb-1 max-w-4xl mx-auto overflow-x-auto scrollbar-hide">
      {filters.map(({ key, label }) => {
        const count = counts[key];
        const isActive = active === key;
        const isLive = key === 'LIVE';
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-condensed font-semibold tracking-wide transition-all duration-200 active:scale-95 ${
              isActive
                ? isLive
                  ? 'bg-live text-white'
                  : 'bg-athlon text-bg'
                : 'bg-surface-1 border border-border text-text-2 hover:border-border-hi hover:text-text-1'
            }`}
          >
            {isLive && isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-live-pulse" />}
            {label}
            {count > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none ${
                  isActive ? (isLive ? 'bg-white/20 text-white' : 'bg-bg/20 text-bg') : 'bg-surface-3 text-text-3'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Fixtures Page ───────────────────────────────────────────────────────

export default function FixturesPage() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const [selectedDate, setSelectedDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const { matches: apiMatches, isLoading, error, refetch } = usePublicMatches({});

  const isToday = isSameDay(selectedDate, today);
  const isYesterday = isSameDay(selectedDate, yesterday);
  const handleDateChange = (d: Date) => {
    if (isSameDay(d, selectedDate)) return;
    setSelectedDate(d);
    setStatusFilter('ALL');
  };

  const allMatchesForDate = useMemo(() => {
    return apiMatches.filter((match) => isSameDay(new Date(match.kickoff_at), selectedDate));
  }, [apiMatches, selectedDate]);

  // Apply status filter
  const filteredMatches = useMemo(() => {
    if (statusFilter === 'ALL') return allMatchesForDate;
    if (statusFilter === 'LIVE')
      return allMatchesForDate.filter((m) => m.status === 'LIVE' || m.status === 'HALFTIME');
    if (statusFilter === 'FINISHED')
      return allMatchesForDate.filter((m) => m.status === 'FINISHED');
    if (statusFilter === 'SCHEDULED')
      return allMatchesForDate.filter((m) => m.status === 'SCHEDULED' || m.status === 'POSTPONED');
    return allMatchesForDate;
  }, [allMatchesForDate, statusFilter]);

  // Counts for filter pills
  const filterCounts: Record<StatusFilter, number> = {
    ALL: allMatchesForDate.length,
    LIVE: allMatchesForDate.filter((m) => m.status === 'LIVE' || m.status === 'HALFTIME').length,
    FINISHED: allMatchesForDate.filter((m) => m.status === 'FINISHED').length,
    SCHEDULED: allMatchesForDate.filter((m) => m.status === 'SCHEDULED' || m.status === 'POSTPONED').length,
  };

  const liveMatches = isToday ? allMatchesForDate.filter((match) => match.status === 'LIVE') : [];
  const showLiveSection =
    isToday && liveMatches.length > 0 && (statusFilter === 'ALL' || statusFilter === 'LIVE');

  // Non-live matches for the main list
  const mainListMatches =
    statusFilter === 'LIVE'
      ? filteredMatches
      : filteredMatches.filter((m) => m.status !== 'LIVE' || !isToday);

  // Dates with live matches (for the navigator dot)
  const datesWithLive = apiMatches
    .filter((match) => match.status === 'LIVE')
    .map((match) => new Date(match.kickoff_at).toDateString());

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          '#0A0F0C',
      }}
    >
      {/* Hero */}
      <FixturesHero liveCount={liveMatches.length} todayCount={allMatchesForDate.length} />

      {/* Sticky date navigator */}
      <DateNavigator selected={selectedDate} onSelect={handleDateChange} datesWithLive={datesWithLive} />

      {/* Status filter bar */}
      {!isLoading && allMatchesForDate.length > 0 && (
        <StatusFilterBar active={statusFilter} onChange={setStatusFilter} counts={filterCounts} />
      )}

      {/* Loading */}
      {isLoading && <LoadingState />}

      {/* Content */}
      {!isLoading && (
        <>
          {error && (
            <div className="px-4 sm:px-6 pt-6 max-w-4xl mx-auto text-center">
              <p className="text-sm font-mono text-live mb-3">Unable to load fixtures from the backend.</p>
              <button onClick={refetch} className="text-xs font-mono text-athlon hover:opacity-80">Retry</button>
            </div>
          )}

          {/* Live now */}
          {!error && showLiveSection && <LiveNowSection matches={liveMatches} />}

          {/* Main match list */}
          {!error && mainListMatches.length > 0 ? (
            <MatchesByDate
              matches={mainListMatches}
              label={
                isToday
                  ? statusFilter === 'FINISHED'
                    ? 'Today\'s Results'
                    : statusFilter === 'SCHEDULED'
                      ? 'Today\'s Fixtures'
                      : 'Today\'s Matches'
                  : isYesterday
                    ? 'Yesterday\'s Results'
                    : selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
              }
            />
          ) : !error && allMatchesForDate.length === 0 ? (
            <EmptyState date={selectedDate} />
          ) : !error ? (
            <div className="px-4 sm:px-6 pt-6 max-w-4xl mx-auto">
              <div className="rounded-lg border border-border bg-surface-1 flex items-center justify-center py-12">
                <p className="text-sm font-mono text-text-3">No {statusFilter.toLowerCase()} matches for this date</p>
              </div>
            </div>
          ) : null}

        </>
      )}
    </div>
  );
}
