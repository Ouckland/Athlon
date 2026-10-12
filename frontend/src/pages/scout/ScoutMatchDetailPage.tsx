import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import { useAuth } from '../../contexts/AuthContext';
import { useMatchLive } from '../../hooks/useMatchLive';
import type { Match, MatchEvent, MatchEventType, MatchStatus, LineupEntry, ApiPlayer } from '../../lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TERMINAL: MatchStatus[] = ['FINISHED', 'CANCELLED', 'POSTPONED'];

const EVENT_TYPES: { type: MatchEventType; label: string; icon: string }[] = [
  { type: 'GOAL',         label: 'Goal',         icon: '⚽' },
  { type: 'YELLOW',       label: 'Yellow Card',  icon: '🟡' },
  { type: 'RED',          label: 'Red Card',     icon: '🔴' },
  { type: 'SUBSTITUTION', label: 'Substitution', icon: '🔄' },
  { type: 'HALFTIME',     label: 'Half Time',    icon: '⏱' },
  { type: 'FULLTIME',     label: 'Full Time',    icon: '🏁' },
];

const EVENT_COLOR: Record<string, string> = {
  GOAL: '#22C55E', YELLOW: '#FBBF24', RED: '#EF4444',
  SUBSTITUTION: '#3B82F6', HALFTIME: '#FBBF24', FULLTIME: '#22C55E',
};

// ─── Score Header ─────────────────────────────────────────────────────────────

function ScoreHeader({ match }: { match: Match }) {
  const live = match.status === 'LIVE' || match.status === 'HALFTIME';
  return (
    <div className="px-5 py-5 rounded-xl mb-4" style={{ background: '#111812', border: '1px solid #243028' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono text-text-3 truncate">{match.competition?.name}</span>
        {match.stage && <span className="text-[10px] font-mono text-text-3">· {match.stage.kind_display}{match.stage.number ? ` ${match.stage.number}` : ''}</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-condensed font-black text-[17px] text-text-1 tracking-tight truncate">{match.home_team.name}</p>
          <p className="text-[10px] font-mono text-text-3">{match.home_team.short_name}</p>
        </div>
        <div className="flex-shrink-0 text-center">
          <div className="flex items-center gap-2">
            <span className="font-condensed font-black text-[36px] leading-none tabular-nums text-text-1">{match.home_score ?? '–'}</span>
            <span className="text-text-3 text-[20px]">:</span>
            <span className="font-condensed font-black text-[36px] leading-none tabular-nums text-text-1">{match.away_score ?? '–'}</span>
          </div>
          {live ? (
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
              <span className="font-mono text-[9px] text-live font-bold tracking-widest">
                {match.status === 'HALFTIME' ? 'HT' : match.minute ? `${match.minute}'` : 'LIVE'}
              </span>
            </div>
          ) : (
            <p className="font-mono text-[9px] text-text-3 tracking-widest mt-1">{match.status_display.toUpperCase()}</p>
          )}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="font-condensed font-black text-[17px] text-text-1 tracking-tight truncate">{match.away_team.name}</p>
          <p className="text-[10px] font-mono text-text-3">{match.away_team.short_name}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Event timeline ───────────────────────────────────────────────────────────

function EventTimeline({ events }: { events: MatchEvent[] }) {
  if (!events.length) return (
    <div className="py-8 text-center rounded-xl mb-4" style={{ background: '#111812', border: '1px solid #243028' }}>
      <p className="text-[12px] text-text-3">No events recorded yet</p>
    </div>
  );
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #243028' }}>
      {[...events].sort((a, b) => b.minute - a.minute).map(ev => {
        const color = EVENT_COLOR[ev.type] ?? '#7A9E80';
        const icon = EVENT_TYPES.find(e => e.type === ev.type)?.icon ?? '·';
        return (
          <div key={ev.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
            style={{ borderBottomColor: 'rgba(36,48,40,0.4)', background: '#111812' }}>
            <span className="font-condensed font-bold text-[13px] tabular-nums w-8 text-right flex-shrink-0" style={{ color }}>{ev.minute}'</span>
            <span className="text-[14px] flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-1 truncate leading-tight">
                {ev.player ? ev.player.display_name : ev.type_display}
              </p>
              {ev.related_player && <p className="text-[10px] font-mono text-text-3 truncate">→ {ev.related_player.display_name}</p>}
            </div>
            <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#40604A' }}>{ev.team?.short_name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lineup display ───────────────────────────────────────────────────────────

function LineupDisplay({ teamName, lineup, onEdit, canEdit }: {
  teamName: string; lineup: LineupEntry[]; onEdit?: () => void; canEdit?: boolean;
}) {
  const starters = lineup.filter(l => l.is_starter);
  const bench = lineup.filter(l => !l.is_starter);
  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #243028' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(36,48,40,0.3)', borderBottom: '1px solid #243028' }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">{teamName}</span>
        {canEdit && onEdit && <button onClick={onEdit} className="text-[10px] font-mono text-athlon hover:opacity-80">Edit →</button>}
      </div>
      {lineup.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[11px] text-text-3">No lineup submitted</p>
          {canEdit && onEdit && <button onClick={onEdit} className="text-[11px] font-mono text-athlon mt-2 hover:opacity-80">Submit lineup →</button>}
        </div>
      ) : (
        <>
          {starters.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0" style={{ borderBottomColor: 'rgba(36,48,40,0.3)' }}>
              <span className="w-6 text-center font-mono text-[10px] text-text-3 flex-shrink-0">{e.player.position}</span>
              <p className="flex-1 text-[12px] text-text-1 truncate">{e.player.display_name}</p>
            </div>
          ))}
          {bench.length > 0 && (
            <>
              <div className="px-4 py-1.5 border-t" style={{ borderTopColor: '#243028', background: 'rgba(36,48,40,0.2)' }}>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">Bench</span>
              </div>
              {bench.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0" style={{ borderBottomColor: 'rgba(36,48,40,0.3)' }}>
                  <span className="w-6 text-center font-mono text-[10px] text-text-3 flex-shrink-0">{e.player.position}</span>
                  <p className="flex-1 text-[12px] text-text-3 truncate">{e.player.display_name}</p>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Lineup Editor ────────────────────────────────────────────────────────────

function LineupEditor({ matchId, teamId, teamName, initialLineup, players, onSaved, onClose }: {
  matchId: number; teamId: number; teamName: string;
  initialLineup: LineupEntry[]; players: ApiPlayer[];
  onSaved: (lineup: LineupEntry[]) => void; onClose: () => void;
}) {
  const [starters, setStarters] = useState<Set<number>>(
    () => new Set(initialLineup.filter(e => e.is_starter).map(e => e.player.id))
  );
  const [bench, setBench] = useState<Set<number>>(
    () => new Set(initialLineup.filter(e => !e.is_starter).map(e => e.player.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function togglePlayer(playerId: number, role: 'starter' | 'bench') {
    if (role === 'starter') {
      setStarters(prev => {
        const next = new Set(prev);
        if (next.has(playerId)) { next.delete(playerId); }
        else {
          next.add(playerId);
          setBench(prev2 => { const b = new Set(prev2); b.delete(playerId); return b; });
        }
        return next;
      });
    } else {
      setBench(prev => {
        const next = new Set(prev);
        if (next.has(playerId)) { next.delete(playerId); }
        else {
          next.add(playerId);
          setStarters(prev2 => { const s = new Set(prev2); s.delete(playerId); return s; });
        }
        return next;
      });
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (starters.size !== 11) { setError('Exactly 11 starters required'); return; }
    if (bench.size > 4) { setError('Maximum 4 bench players'); return; }
    setSubmitting(true);
    setError('');
    try {
      const result = await api.put<LineupEntry[]>(API_PATHS.matches.lineups(matchId, teamId), {
        team_id: teamId,
        starters: Array.from(starters),
        bench: Array.from(bench),
      });
      onSaved(Array.isArray(result) ? result : []);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(typeof d['detail'] === 'string' ? d['detail'] : `Error ${err.status}`);
      } else {
        setError('Failed to save lineup');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-up"
        style={{ background: '#111812', border: '1px solid #243028', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#243028' }}>
          <div>
            <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight">{teamName} Lineup</h2>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">Starters: {starters.size}/11 · Bench: {bench.size}/4</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text-1 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          {error && (
            <div className="mx-5 mt-3 px-4 py-2 rounded-lg text-[12px] font-mono flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              {error}
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-[1fr_56px_56px] gap-2 px-5 py-2 border-b sticky top-0" style={{ borderColor: '#243028', background: '#111812' }}>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">Player</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">START</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">BENCH</span>
            </div>
            {players.map(p => {
              const isStarter = starters.has(p.id);
              const isBench = bench.has(p.id);
              return (
                <div key={p.id} className="grid grid-cols-[1fr_56px_56px] gap-2 items-center px-5 py-2.5 border-b last:border-0"
                  style={{ borderBottomColor: 'rgba(36,48,40,0.4)' }}>
                  <div className="min-w-0">
                    <p className={`text-[12px] font-medium truncate ${isStarter || isBench ? 'text-text-1' : 'text-text-3'}`}>{p.display_name}</p>
                    <p className="text-[10px] font-mono text-text-3">{p.position}{p.shirt_number != null ? ` · #${p.shirt_number}` : ''}</p>
                  </div>
                  <div className="flex justify-center">
                    <button type="button" onClick={() => togglePlayer(p.id, 'starter')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: isStarter ? '#22C55E' : '#111812', border: `1px solid ${isStarter ? '#22C55E' : '#243028'}` }}>
                      {isStarter && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#0A0F0C" strokeWidth={1.8} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4" /></svg>}
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button type="button" onClick={() => togglePlayer(p.id, 'bench')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: isBench ? '#3B82F6' : '#111812', border: `1px solid ${isBench ? '#3B82F6' : '#243028'}` }}>
                      {isBench && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4" /></svg>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: '#243028' }}>
            <button type="submit" disabled={submitting}
              className="w-full py-3 rounded-xl font-condensed font-bold text-[14px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {submitting ? 'Saving…' : 'Save Lineup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Event Recorder ───────────────────────────────────────────────────────────

type EventFormResult = { event: MatchEvent; match: Match };

function EventRecorder({ match, players, onRecorded }: {
  match: Match;
  players: { home: ApiPlayer[]; away: ApiPlayer[] };
  onRecorded: (result: EventFormResult) => void;
}) {
  const [eventType, setEventType] = useState<MatchEventType>('GOAL');
  const [minute, setMinute] = useState('');
  const [teamSide, setTeamSide] = useState<'home' | 'away'>('home');
  const [playerId, setPlayerId] = useState('');
  const [relatedPlayerId, setRelatedPlayerId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedTeamId = teamSide === 'home' ? match.home_team.id : match.away_team.id;
  const teamPlayers = teamSide === 'home' ? players.home : players.away;
  const needsTeam = !['HALFTIME', 'FULLTIME'].includes(eventType);
  const needsPlayer = ['GOAL', 'YELLOW', 'RED', 'SUBSTITUTION'].includes(eventType);
  const needsRelated = ['GOAL', 'SUBSTITUTION'].includes(eventType);
  const relatedLabel = eventType === 'GOAL' ? 'Assist (optional)' : 'Player Coming On';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!minute) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string | number | null> = {
        type: eventType,
        minute: parseInt(minute, 10),
        description: description.trim() || '',
      };
      if (needsTeam) body['team_id'] = selectedTeamId;
      if (needsPlayer && playerId) body['player_id'] = Number(playerId);
      if (needsRelated && relatedPlayerId) body['related_player_id'] = Number(relatedPlayerId);
      const result = await api.post<EventFormResult>(API_PATHS.matches.events(match.id), body);
      setSuccess(true);
      setMinute(''); setPlayerId(''); setRelatedPlayerId(''); setDescription('');
      setTimeout(() => setSuccess(false), 2000);
      onRecorded(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(typeof d['detail'] === 'string' ? d['detail'] :
          Array.isArray(d['non_field_errors']) ? String(d['non_field_errors'][0]) :
          `Error ${err.status}`);
      } else {
        setError('Failed to record event');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const evColor = EVENT_COLOR[eventType] ?? '#22C55E';

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${evColor}25` }}>
      {/* Event type grid */}
      <div className="px-4 py-3 border-b" style={{ borderColor: '#243028', background: 'rgba(36,48,40,0.15)' }}>
        <div className="grid grid-cols-3 gap-1.5">
          {EVENT_TYPES.map(et => (
            <button key={et.type} type="button"
              onClick={() => { setEventType(et.type); setPlayerId(''); setRelatedPlayerId(''); }}
              className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-[11px] font-condensed font-bold tracking-wide transition-all active:scale-[0.97]"
              style={{
                background: eventType === et.type ? (EVENT_COLOR[et.type] + '18') : '#111812',
                color: eventType === et.type ? EVENT_COLOR[et.type] : '#7A9E80',
                border: `1px solid ${eventType === et.type ? EVENT_COLOR[et.type] + '50' : '#243028'}`,
              }}>
              <span className="text-[16px] leading-none">{et.icon}</span>
              <span className="leading-tight">{et.label}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
        {error && (
          <div className="px-4 py-2.5 rounded-lg text-[12px] font-mono"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="px-4 py-2.5 rounded-lg text-[12px] font-mono"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
            ✓ Event recorded
          </div>
        )}

        {/* Minute — large tap target */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1">Minute *</label>
          <input type="number" value={minute} onChange={e => setMinute(e.target.value)}
            min={1} max={200} required placeholder="e.g. 45"
            className="w-full px-3 py-3 text-[20px] text-text-1 placeholder-text-3 outline-none rounded-lg font-condensed font-bold text-center"
            style={{ background: '#0A0F0C', border: `1px solid ${evColor}40` }} />
        </div>

        {/* Team */}
        {needsTeam && (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1">Team *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['home', 'away'] as const).map(side => {
                const team = side === 'home' ? match.home_team : match.away_team;
                const active = teamSide === side;
                return (
                  <button key={side} type="button" onClick={() => { setTeamSide(side); setPlayerId(''); setRelatedPlayerId(''); }}
                    className="py-3 rounded-lg font-condensed font-bold text-[14px] tracking-wide transition-all active:scale-[0.97]"
                    style={{ background: active ? '#22C55E' : '#111812', color: active ? '#0A0F0C' : '#7A9E80', border: `1px solid ${active ? '#22C55E' : '#243028'}` }}>
                    {team.short_name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Player */}
        {needsPlayer && (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1">
              {eventType === 'SUBSTITUTION' ? 'Player Going Off' : 'Player'}
            </label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
              <option value="">Select player…</option>
              {teamPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}{p.shirt_number != null ? ` (#${p.shirt_number})` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Related player */}
        {needsRelated && (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1">{relatedLabel}</label>
            <select value={relatedPlayerId} onChange={e => setRelatedPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] text-text-1 outline-none rounded-lg appearance-none"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}>
              <option value="">{eventType === 'GOAL' ? 'No assist' : 'Select player…'}</option>
              {teamPlayers.filter(p => eventType === 'SUBSTITUTION' ? String(p.id) !== playerId : true).map(p => (
                <option key={p.id} value={p.id}>{p.display_name}{p.shirt_number != null ? ` (#${p.shirt_number})` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1">Note (optional)</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Optional note…" maxLength={200}
            className="w-full px-3 py-2.5 text-[13px] text-text-1 placeholder-text-3 outline-none rounded-lg"
            style={{ background: '#0A0F0C', border: '1px solid #243028' }} />
        </div>

        {/* Submit */}
        <button type="submit" disabled={!minute || submitting}
          className="w-full py-4 rounded-xl font-condensed font-bold text-[16px] tracking-[0.06em] disabled:opacity-40 transition-all active:scale-[0.98]"
          style={{ background: evColor, color: ['YELLOW', 'FULLTIME'].includes(eventType) ? '#0A0F0C' : '#fff' }}>
          {submitting ? 'Recording…' : `Record ${EVENT_TYPES.find(e => e.type === eventType)?.label ?? eventType}`}
        </button>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScoutMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const id = matchId ? parseInt(matchId, 10) : null;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [match, setMatch]             = useState<Match | null>(null);
  const [events, setEvents]           = useState<MatchEvent[]>([]);
  const [homeLineup, setHomeLineup]   = useState<LineupEntry[]>([]);
  const [awayLineup, setAwayLineup]   = useState<LineupEntry[]>([]);
  const [homePlayers, setHomePlayers] = useState<ApiPlayer[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<ApiPlayer[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<'events' | 'lineups'>('events');
  const [lineupTeam, setLineupTeam]   = useState<'home' | 'away' | null>(null);

  const canRecord = user?.role === 'SCOUT' || user?.role === 'ADMIN';
  const isTerminal = match ? TERMINAL.includes(match.status) : false;

  const loadAll = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [matchData, eventsData] = await Promise.all([
        api.get<Match>(API_PATHS.matches.detail(id)),
        api.get<MatchEvent[]>(API_PATHS.matches.events(id)),
      ]);
      setMatch(matchData);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setError(null);

      const [hlu, alu, hpl, apl] = await Promise.allSettled([
        api.get<LineupEntry[]>(API_PATHS.matches.lineups(id, matchData.home_team.id)),
        api.get<LineupEntry[]>(API_PATHS.matches.lineups(id, matchData.away_team.id)),
        api.get<ApiPlayer[]>(API_PATHS.players.list, { team: matchData.home_team.id } as Record<string, string | number | boolean | undefined>),
        api.get<ApiPlayer[]>(API_PATHS.players.list, { team: matchData.away_team.id } as Record<string, string | number | boolean | undefined>),
      ]);
      if (hlu.status === 'fulfilled') setHomeLineup(Array.isArray(hlu.value) ? hlu.value : []);
      if (alu.status === 'fulfilled') setAwayLineup(Array.isArray(alu.value) ? alu.value : []);
      if (hpl.status === 'fulfilled') setHomePlayers(Array.isArray(hpl.value) ? hpl.value : []);
      if (apl.status === 'fulfilled') setAwayPlayers(Array.isArray(apl.value) ? apl.value : []);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.status) : 'Failed to load match');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // WS keeps score/minute live; also refetches events on WS event
  const handleWsEvent = useCallback(() => { loadAll(); }, [loadAll]);
  const { liveState } = useMatchLive(
    id,
    match != null && match.status === 'LIVE',
    handleWsEvent,
  );

  const displayMatch: Match | null = match ? {
    ...match,
    minute: liveState?.minute ?? match.minute,
    home_score: liveState?.home_score ?? match.home_score,
    away_score: liveState?.away_score ?? match.away_score,
  } : null;

  function handleEventRecorded(result: EventFormResult) {
    setMatch(result.match);
    setEvents(prev => [result.event, ...prev]);
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-7 h-7 rounded-full border-2 border-athlon border-t-transparent animate-spin" />
    </div>
  );

  if (error || !displayMatch) return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/scout/matches')} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 mb-5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
        Scout Matches
      </button>
      <div className="flex flex-col items-center gap-3 py-16 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <p className="text-[13px] font-mono text-live">{error ?? 'Match not found'}</p>
        <button onClick={loadAll} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
      </div>
    </div>
  );

  const editingLineup = lineupTeam === 'home'
    ? { teamId: displayMatch.home_team.id, teamName: displayMatch.home_team.name, lineup: homeLineup, players: homePlayers }
    : lineupTeam === 'away'
    ? { teamId: displayMatch.away_team.id, teamName: displayMatch.away_team.name, lineup: awayLineup, players: awayPlayers }
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 animate-fade-in">
      <button onClick={() => navigate('/scout/matches')} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-4">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
        Scout Matches
      </button>

      <ScoreHeader match={displayMatch} />

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        {(['events', 'lineups'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.1em] font-medium transition-all"
            style={{
              background: activeTab === tab ? '#22C55E' : '#111812',
              color: activeTab === tab ? '#0A0F0C' : '#7A9E80',
              border: `1px solid ${activeTab === tab ? '#22C55E' : '#243028'}`,
            }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'events' ? (
        <>
          <EventTimeline events={events} />
          {canRecord && !isTerminal ? (
            <div>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3 mb-3">Record Event</h2>
              <EventRecorder match={displayMatch} players={{ home: homePlayers, away: awayPlayers }} onRecorded={handleEventRecorded} />
            </div>
          ) : isTerminal ? (
            <div className="py-6 text-center rounded-xl" style={{ background: 'rgba(36,48,40,0.2)', border: '1px solid #243028' }}>
              <p className="text-[12px] font-mono text-text-3">Match is {displayMatch.status_display} — recording disabled</p>
            </div>
          ) : (
            <div className="py-6 text-center rounded-xl" style={{ background: 'rgba(36,48,40,0.2)', border: '1px solid #243028' }}>
              <p className="text-[12px] font-mono text-text-3">You do not have permission to record events</p>
            </div>
          )}
        </>
      ) : (
        <div>
          <LineupDisplay teamName={displayMatch.home_team.name} lineup={homeLineup}
            canEdit={canRecord && displayMatch.status === 'SCHEDULED'} onEdit={() => setLineupTeam('home')} />
          <LineupDisplay teamName={displayMatch.away_team.name} lineup={awayLineup}
            canEdit={canRecord && displayMatch.status === 'SCHEDULED'} onEdit={() => setLineupTeam('away')} />
          {displayMatch.status !== 'SCHEDULED' && canRecord && (
            <p className="text-[11px] font-mono text-text-3 text-center mt-2">Lineups are locked once the match begins</p>
          )}
        </div>
      )}

      {lineupTeam && editingLineup && (
        <LineupEditor
          matchId={displayMatch.id}
          teamId={editingLineup.teamId}
          teamName={editingLineup.teamName}
          initialLineup={editingLineup.lineup}
          players={editingLineup.players}
          onSaved={result => {
            if (lineupTeam === 'home') setHomeLineup(result);
            else setAwayLineup(result);
            setLineupTeam(null);
          }}
          onClose={() => setLineupTeam(null)}
        />
      )}
    </div>
  );
}
