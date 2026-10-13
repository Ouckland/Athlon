import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { FantasyTeamFull, Squad, SquadEntry, Stage, ApiPlayer } from '../../lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const POS_COLOR: Record<string, string> = { GK: '#FBBF24', DEF: '#3B82F6', MID: '#22C55E', ATT: '#EF4444' };
const SQUAD_RULES = { GK: 2, DEF: 5, MID: 5, ATT: 3 };
const POSITIONS = ['GK', 'DEF', 'MID', 'ATT'] as const;
type Pos = typeof POSITIONS[number];
const FORMATION: Record<Pos, number> = { GK: 1, DEF: 4, MID: 4, ATT: 2 };

// ─── Types used in builder ────────────────────────────────────────────────────

type Selection = { player: ApiPlayer; is_starter: boolean; is_captain: boolean };

// ─── Avatar ───────────────────────────────────────────────────────────────────

function PlayerAvatar({ player, size = 'md' }: { player: ApiPlayer; size?: 'sm' | 'md' | 'lg' | 'card' }) {
  const [err, setErr] = useState(false);
  const posColor = POS_COLOR[player.position] ?? '#7A9E80';
  const dim = size === 'card' ? 'w-full h-full text-[18px]' : size === 'sm' ? 'w-7 h-7 text-[9px]' : size === 'lg' ? 'w-12 h-12 text-[16px]' : 'w-9 h-9 text-[11px]';
  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`;
  if (!player.photo || err) {
    return (
      <div className={`${dim} ${size === 'card' ? '' : 'rounded-lg flex-shrink-0'} flex items-center justify-center font-condensed font-bold`}
        style={{ background: size === 'card' ? `linear-gradient(145deg, ${posColor}55, #073A27)` : posColor + '20', color: size === 'card' ? '#FFFFFF' : posColor, border: size === 'card' ? undefined : `1px solid ${posColor}30` }}>
        {initials}
      </div>
    );
  }
  return (
    <img src={player.photo} alt={player.display_name} onError={() => setErr(true)}
      className={`${dim} ${size === 'card' ? 'object-cover object-top' : 'rounded-lg object-cover flex-shrink-0'}`}
      style={{ border: size === 'card' ? undefined : '1px solid #243028' }} />
  );
}

// ─── Pitch player ────────────────────────────────────────────────────────────

function PitchPlayer({
  selection,
  onRemove,
  onToggleStarter,
  onToggleCaptain,
}: {
  selection: Selection;
  onRemove: () => void;
  onToggleStarter: () => void;
  onToggleCaptain: () => void;
}) {
  const { player, is_starter, is_captain } = selection;
  const posColor = POS_COLOR[player.position] ?? '#7A9E80';
  const playerPoints = (player as ApiPlayer & { points?: number }).points;

  return (
    <div className="relative min-w-0 rounded-md overflow-hidden text-center shadow-md" style={{ background: '#087746', border: `1px solid ${is_captain ? '#F8D65A' : 'rgba(255,255,255,0.18)'}`, boxShadow: is_captain ? '0 0 0 1px rgba(248,214,90,0.35), 0 4px 12px rgba(0,0,0,0.22)' : '0 3px 10px rgba(0,0,0,0.2)' }}>
      <div className="relative h-[68px] sm:h-[76px] flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(180deg, ${posColor}28, rgba(4,50,31,0.35))` }}>
        <PlayerAvatar player={player} size="card" />
        <button
          onClick={onToggleCaptain}
          title={is_captain ? 'Remove captain' : 'Make captain'}
          aria-label={is_captain ? `Remove captain from ${player.display_name}` : `Make ${player.display_name} captain`}
          className="absolute top-1 left-1 w-[17px] h-[17px] rounded-full flex items-center justify-center text-[9px] font-black shadow-sm"
          style={{ background: is_captain ? '#F8D65A' : '#35043E', color: is_captain ? '#26032C' : '#FFFFFF', border: '1px solid rgba(255,255,255,0.45)' }}
        >C</button>
        <div className="absolute top-1 right-1 flex gap-0.5">
          <button onClick={onToggleStarter} title={is_starter ? 'Move to bench' : 'Make starter'} aria-label={is_starter ? `Move ${player.display_name} to bench` : `Make ${player.display_name} a starter`} className="w-[17px] h-[17px] rounded-full flex items-center justify-center text-[7px] font-bold shadow-sm" style={{ background: 'rgba(5,48,30,0.88)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.35)' }}>{is_starter ? 'B' : 'XI'}</button>
          <button onClick={onRemove} title={`Remove ${player.display_name}`} aria-label={`Remove ${player.display_name}`} className="w-[17px] h-[17px] rounded-full flex items-center justify-center text-[10px] shadow-sm" style={{ background: 'rgba(5,48,30,0.88)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.35)' }}>
            <svg width="8" height="8" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 2l6 6M8 2L2 8" /></svg>
          </button>
        </div>
      </div>
      <p className="px-0.5 py-1 truncate text-[9px] sm:text-[10px] font-semibold leading-tight" style={{ background: '#F7F7F2', color: '#300039' }} title={player.display_name}>
        {player.display_name}
      </p>
      <div className="flex items-center justify-center gap-1 px-1 py-1" style={{ background: '#35043E', color: '#FFFFFF' }}>
        <span className="text-[7px] font-mono font-bold uppercase tracking-wider opacity-70">Pts</span>
        <span className="text-[10px] sm:text-[11px] font-condensed font-black tabular-nums leading-none">{typeof playerPoints === 'number' ? playerPoints : '—'}</span>
      </div>
    </div>
  );
}

function SquadPitch({
  starters,
  onRemove,
  onToggleStarter,
  onToggleCaptain,
  onPick,
}: {
  starters: Selection[];
  onRemove: (selection: Selection) => void;
  onToggleStarter: (selection: Selection) => void;
  onToggleCaptain: (selection: Selection) => void;
  onPick: (position: Pos) => void;
}) {
  const rows: { position: Pos; label: string }[] = [
    { position: 'ATT', label: 'Strikers' },
    { position: 'MID', label: 'Midfielders' },
    { position: 'DEF', label: 'Defenders' },
    { position: 'GK', label: 'Goalkeeper' },
  ];

  return (
    <div className="relative overflow-hidden rounded-lg px-2 py-3 sm:px-4" style={{ background: 'repeating-linear-gradient(0deg, #07894A 0px, #07894A 58px, #078244 58px, #078244 116px)', border: '1px solid #22C55E', minHeight: 440 }}>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 600" preserveAspectRatio="none" fill="none" aria-hidden>
        <rect x="12" y="12" width="376" height="576" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <line x1="12" y1="300" x2="388" y2="300" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <circle cx="200" cy="300" r="54" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <circle cx="200" cy="300" r="2" fill="rgba(255,255,255,0.8)" />
        <rect x="105" y="12" width="190" height="72" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <rect x="145" y="12" width="110" height="32" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <rect x="105" y="516" width="190" height="72" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <rect x="145" y="556" width="110" height="32" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      </svg>
      <div className="relative z-10 grid h-full grid-rows-4 gap-3" style={{ minHeight: 412 }}>
        {rows.map(({ position, label }) => {
          const rowPlayers = starters.filter(selection => selection.player.position === position);
          const emptySlots = Math.max(0, FORMATION[position] - rowPlayers.length);
          const slotCount = Math.max(FORMATION[position], rowPlayers.length);
          return (
            <div key={position} className="flex flex-col justify-center">
              <p className="mb-1 text-center text-[8px] sm:text-[9px] font-mono uppercase tracking-widest text-white/70">{label}</p>
              <div className="mx-auto grid w-full max-w-lg gap-1.5" style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}>
                {rowPlayers.map(selection => (
                  <PitchPlayer
                    key={selection.player.id}
                    selection={selection}
                    onRemove={() => onRemove(selection)}
                    onToggleStarter={() => onToggleStarter(selection)}
                    onToggleCaptain={() => onToggleCaptain(selection)}
                  />
                ))}
                {Array.from({ length: emptySlots }, (_, index) => (
                  <button
                    key={`${position}-empty-${index}`}
                    onClick={() => onPick(position)}
                    className="min-w-0 min-h-[72px] rounded-md flex flex-col items-center justify-center gap-1 border border-dashed border-white/50 bg-black/10 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
                    aria-label={`Choose ${label.slice(0, -1).toLowerCase()} for starting lineup`}
                  >
                    <span className="text-xl leading-none">+</span>
                    <span className="text-[8px] sm:text-[9px] font-mono font-bold">{position}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Player Picker ────────────────────────────────────────────────────────────

function PlayerPicker({
  availablePlayers,
  selectedIds,
  posFilter,
  onSelect,
  onClose,
}: {
  availablePlayers: ApiPlayer[];
  selectedIds: Set<number>;
  posFilter: Pos | null;
  onSelect: (p: ApiPlayer) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Pos | null>(posFilter);

  const q = search.toLowerCase();
  const filtered = availablePlayers.filter(p =>
    !selectedIds.has(p.id) &&
    (!pos || p.position === pos) &&
    (!q || p.display_name.toLowerCase().includes(q) || p.team?.name.toLowerCase().includes(q))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl overflow-hidden flex flex-col animate-fade-up"
        style={{ background: '#111812', border: '1px solid #243028', maxHeight: '80vh' }}
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-condensed font-bold text-[16px] text-text-1">Pick a Player</h3>
          <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
          <div className="flex gap-1.5">
            {([null, ...POSITIONS] as (Pos | null)[]).map(p => (
              <button
                key={p ?? 'all'}
                onClick={() => setPos(p)}
                className="px-2.5 py-1 text-[10px] font-condensed font-bold rounded tracking-wider transition-colors"
                style={{
                  background: pos === p ? (POS_COLOR[p!] ?? '#22C55E') : '#1E2A20',
                  color: pos === p ? '#0A0F0C' : p ? POS_COLOR[p] : '#7A9E80',
                  border: `1px solid ${pos === p ? (POS_COLOR[p!] ?? '#22C55E') : '#243028'}`,
                }}
              >
                {p ?? 'ALL'}
              </button>
            ))}
          </div>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player or team…"
              className="w-full pl-8 pr-3 py-2 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-lg"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-text-3">
              {search || pos ? 'No players match' : 'No players available'}
            </div>
          ) : (
            filtered.map(p => {
              const posColor = POS_COLOR[p.position] ?? '#7A9E80';
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors hover:bg-surface-2"
                  style={{ borderBottomColor: 'rgba(36,48,40,0.4)' }}
                >
                  <PlayerAvatar player={p} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-text-1 truncate">{p.display_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] font-condensed font-bold px-1 py-0.5 rounded" style={{ background: posColor + '20', color: posColor }}>{p.position}</span>
                      <span className="text-[9px] font-mono text-text-3">{p.team?.short_name ?? ''}</span>
                    </div>
                  </div>
                  {p.shirt_number !== null && (
                    <span className="font-condensed font-black text-[16px] text-text-3 tabular-nums flex-shrink-0">#{p.shirt_number}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FantasyTeamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teamIdParam = searchParams.get('teamId');

  // Fantasy teams
  const [teams, setTeams] = useState<FantasyTeamFull[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<FantasyTeamFull | null>(null);

  // Stages
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);

  // Squad
  const [savedSquad, setSavedSquad] = useState<Squad | null>(null);
  const [squadLoading, setSquadLoading] = useState(false);

  // Player pool
  const [playerPool, setPlayerPool] = useState<ApiPlayer[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  // Builder state
  const [selections, setSelections] = useState<Selection[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosFilter, setPickerPosFilter] = useState<Pos | null>(null);
  const [pickerIsStarter, setPickerIsStarter] = useState(true);

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load teams
  useEffect(() => {
    api.get<FantasyTeamFull[]>(API_PATHS.fantasy.teams)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setTeams(arr);
        const initial = teamIdParam ? arr.find(t => String(t.id) === teamIdParam) ?? arr[0] : arr[0];
        setSelectedTeam(initial ?? null);
      })
      .catch(() => setTeams([]))
      .finally(() => setTeamsLoading(false));
  }, [teamIdParam]);

  // Load stages when team changes
  useEffect(() => {
    if (!selectedTeam) return;
    setStagesLoading(true);
    setStages([]);
    setSelectedStage(null);
    api.get<Stage[]>(API_PATHS.stages.list(selectedTeam.season.id))
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setStages(arr);
        setSelectedStage(arr[0] ?? null);
      })
      .catch(() => setStages([]))
      .finally(() => setStagesLoading(false));
  }, [selectedTeam]);

  // Load saved squad when team+stage changes
  useEffect(() => {
    if (!selectedTeam || !selectedStage) return;
    setSquadLoading(true);
    setSavedSquad(null);
    api.get<Squad>(API_PATHS.fantasy.squad(selectedTeam.id, selectedStage.id))
      .then(data => {
        setSavedSquad(data);
        setSaveSuccess(false);
      })
      .catch(() => setSavedSquad(null))
      .finally(() => setSquadLoading(false));
  }, [selectedTeam, selectedStage]);

  // Load player pool from competition teams → players
  useEffect(() => {
    if (!selectedTeam) return;
    setPoolLoading(true);
    setPlayerPool([]);
    api.get<{ id: number; name: string }[]>(API_PATHS.competitions.teams(selectedTeam.competition.id))
      .then(async teams => {
        const arr = Array.isArray(teams) ? teams : [];
        const results = await Promise.allSettled(
          arr.map(t => api.get<ApiPlayer[]>(API_PATHS.players.list, { team: t.id }))
        );
        const players: ApiPlayer[] = [];
        results.forEach(r => { if (r.status === 'fulfilled' && Array.isArray(r.value)) players.push(...r.value); });
        setPlayerPool(players);
      })
      .catch(() => setPlayerPool([]))
      .finally(() => setPoolLoading(false));
  }, [selectedTeam]);

  // Init builder from saved squad
  useEffect(() => {
    if (!savedSquad || playerPool.length === 0) return;
    const allEntries = [...savedSquad.starters, ...savedSquad.bench];
    const built: Selection[] = allEntries.map(e => {
      const player = playerPool.find(p => p.id === e.player.id) ?? {
        id: e.player.id,
        first_name: e.player.first_name,
        last_name: e.player.last_name,
        display_name: e.player.display_name,
        position: e.player.position as Pos,
        position_display: e.player.position,
        shirt_number: e.player.shirt_number,
        team: e.player.team ? { ...e.player.team, short_name: '', slug: '' } : null,
        user_id: null,
        photo: null,
        created_at: '',
        updated_at: '',
      } as ApiPlayer;
      return { player, is_starter: e.is_starter, is_captain: e.is_captain };
    });
    setSelections(built);
  }, [savedSquad, playerPool]);

  const selectedIds = new Set(selections.map(s => s.player.id));

  function openPlayerPicker(position: Pos, isStarter: boolean) {
    setPickerPosFilter(position);
    setPickerIsStarter(isStarter);
    setPickerOpen(true);
  }

  function addPlayer(player: ApiPlayer) {
    const existing_captain = selections.some(s => s.is_captain);
    setSelections(prev => [...prev, { player, is_starter: pickerIsStarter, is_captain: !existing_captain && pickerIsStarter }]);
  }

  function removePlayer(idx: number) {
    setSelections(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // Reassign captain if removed
      if (prev[idx].is_captain && next.length > 0) {
        const firstStarter = next.findIndex(s => s.is_starter);
        if (firstStarter >= 0) next[firstStarter] = { ...next[firstStarter], is_captain: true };
      }
      return next;
    });
  }

  function toggleStarter(idx: number) {
    setSelections(prev => {
      const next = [...prev];
      const s = next[idx];
      const starterCount = next.filter(x => x.is_starter).length;
      if (s.is_starter && starterCount <= 1) return prev;
      const newStarter = !s.is_starter;
      next[idx] = { ...s, is_starter: newStarter, is_captain: newStarter ? s.is_captain : false };
      // If was captain and moved to bench, assign to first starter
      if (s.is_captain && !newStarter) {
        const fi = next.findIndex((x, i) => i !== idx && x.is_starter);
        if (fi >= 0) next[fi] = { ...next[fi], is_captain: true };
      }
      return next;
    });
  }

  function toggleCaptain(idx: number) {
    setSelections(prev =>
      prev.map((s, i) => ({
        ...s,
        is_captain: i === idx ? !s.is_captain : (s.is_captain && prev[idx].is_captain ? false : s.is_captain),
      }))
    );
  }

  async function handleSave() {
    if (!selectedTeam || !selectedStage) return;
    setSaveError('');
    setSaving(true);
    setSaveSuccess(false);
    try {
      await api.put(API_PATHS.fantasy.squad(selectedTeam.id, selectedStage.id), {
        selections: selections.map(s => ({
          player_id: s.player.id,
          is_starter: s.is_starter,
          is_captain: s.is_captain,
        })),
      });
      setSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setSaveError(typeof d['detail'] === 'string' ? d['detail'] : `Error ${err.status}`);
      } else {
        setSaveError('Failed to save squad.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const starterCount = selections.filter(s => s.is_starter).length;
  const benchCount = selections.filter(s => !s.is_starter).length;
  const captainCount = selections.filter(s => s.is_captain).length;
  const posCount = (pos: string) => selections.filter(s => s.player.position === pos).length;
  const total = selections.length;
  const isComplete = total === 15 && starterCount === 11 && benchCount === 4 && captainCount === 1 &&
    posCount('GK') === 2 && posCount('DEF') === 5 && posCount('MID') === 5 && posCount('ATT') === 3;

  if (teamsLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-athlon border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!selectedTeam) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="font-condensed font-bold text-[20px] text-text-1 mb-2">No fantasy team</p>
        <p className="text-[12px] text-text-3 mb-6">Create your team from the Fantasy dashboard.</p>
        <button onClick={() => navigate('/app/fantasy')} className="text-[12px] font-mono text-athlon hover:opacity-80">← Back to Fantasy</button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-4 pb-24">
      {/* Back */}
      <button onClick={() => navigate('/app/fantasy')} className="flex items-center gap-1.5 text-[11px] font-mono text-text-3 hover:text-text-2 transition-colors mb-4">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
        Fantasy
      </button>

      {/* Team selector */}
      {teams.length > 1 && (
        <div className="mb-4">
          <select
            value={selectedTeam.id}
            onChange={e => setSelectedTeam(teams.find(t => t.id === Number(e.target.value)) ?? null)}
            className="w-full px-3 py-2 text-[13px] text-text-1 outline-none rounded-lg"
            style={{ background: '#111812', border: '1px solid #243028' }}
          >
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* Team + stage header */}
      <div className="mb-4 px-4 py-4 rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-condensed font-black text-[22px] text-text-1 tracking-tight leading-none">{selectedTeam.name}</h1>
            <p className="text-[11px] font-mono text-text-3 mt-1">{selectedTeam.competition.name} · {selectedTeam.season.name}</p>
          </div>
          <div className="text-right">
            <p className="font-condensed font-black text-[28px] text-text-1 tabular-nums leading-none">{selectedTeam.total_points}</p>
            <p className="text-[9px] font-mono text-text-3">PTS</p>
          </div>
        </div>

        {/* Stage selector */}
        {stagesLoading ? (
          <div className="mt-3 h-8 bg-surface-2 rounded-lg animate-pulse" />
        ) : stages.length > 0 ? (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {stages.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStage(s)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-mono font-medium transition-colors"
                style={{
                  background: selectedStage?.id === s.id ? '#22C55E' : '#1E2A20',
                  color: selectedStage?.id === s.id ? '#0A0F0C' : '#7A9E80',
                  border: `1px solid ${selectedStage?.id === s.id ? '#22C55E' : '#243028'}`,
                }}
              >
                {s.number ? `${s.kind_display} ${s.number}` : s.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Squad composition summary */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        {POSITIONS.map(pos => {
          const required = SQUAD_RULES[pos];
          const count = posCount(pos);
          const done = count === required;
          return (
            <div key={pos} className="rounded-lg px-3 py-2 text-center" style={{ background: '#111812', border: `1px solid ${done ? POS_COLOR[pos] + '30' : '#243028'}` }}>
              <p className="font-condensed font-bold text-[11px] tabular-nums" style={{ color: done ? POS_COLOR[pos] : '#7A9E80' }}>
                {count}/{required}
              </p>
              <p className="text-[8px] font-condensed font-bold tracking-widest mt-0.5" style={{ color: POS_COLOR[pos], opacity: done ? 1 : 0.5 }}>{pos}</p>
            </div>
          );
        })}
      </div>
      <div className="mb-4 flex gap-2 text-[10px] font-mono">
        <span className={`px-2 py-1 rounded ${total === 15 ? 'text-athlon' : 'text-text-3'}`} style={{ background: '#111812', border: '1px solid #243028' }}>
          {total}/15 players
        </span>
        <span className={`px-2 py-1 rounded ${starterCount === 11 ? 'text-athlon' : 'text-text-3'}`} style={{ background: '#111812', border: '1px solid #243028' }}>
          {starterCount}/11 starters
        </span>
        <span className={`px-2 py-1 rounded ${captainCount === 1 ? 'text-athlon' : 'text-text-3'}`} style={{ background: '#111812', border: '1px solid #243028' }}>
          {captainCount === 1 ? '⭐ Captain set' : 'No captain'}
        </span>
      </div>

      {/* Starters */}
      {squadLoading ? (
        <div className="animate-pulse space-y-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-surface-1 rounded-lg" />)}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">Starting XI · {starterCount}/11</p>
              <span className="text-[9px] font-mono text-text-3">Tap C for captain</span>
            </div>
            <SquadPitch
              starters={selections.filter(s => s.is_starter)}
              onRemove={selection => removePlayer(selections.indexOf(selection))}
              onToggleStarter={selection => toggleStarter(selections.indexOf(selection))}
              onToggleCaptain={selection => toggleCaptain(selections.indexOf(selection))}
              onPick={position => openPlayerPicker(position, true)}
            />
          </div>

          <div className="mb-4 rounded-lg p-3" style={{ background: '#111812', border: '1px solid #243028' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">Bench · {benchCount}/4</p>
              <span className="text-[9px] font-mono text-text-3">Tap XI to promote</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {POSITIONS.map(position => {
                const benchPlayers = selections.filter(selection => !selection.is_starter && selection.player.position === position);
                if (benchPlayers.length > 0) {
                  return benchPlayers.map(selection => (
                    <PitchPlayer
                      key={selection.player.id}
                      selection={selection}
                      onRemove={() => removePlayer(selections.indexOf(selection))}
                      onToggleStarter={() => toggleStarter(selections.indexOf(selection))}
                      onToggleCaptain={() => toggleCaptain(selections.indexOf(selection))}
                    />
                  ));
                }
                return (
                  <button
                    key={`${position}-bench-empty`}
                    onClick={() => openPlayerPicker(position, false)}
                    className="min-w-0 min-h-[88px] rounded-md flex flex-col items-center justify-center gap-1 border border-dashed border-border-hi text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors"
                    aria-label={`Choose ${position} player for the bench`}
                  >
                    <span className="text-xl leading-none">+</span>
                    <span className="text-[9px] font-mono font-bold">{position}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Save errors / success */}
      {saveError && (
        <div className="mb-4 px-4 py-3 rounded-lg text-[12px] font-mono" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="mb-4 px-4 py-3 rounded-lg text-[12px] font-mono flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3L10 3" /></svg>
          Squad saved successfully
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !selectedStage}
        className="w-full py-3.5 rounded-xl font-condensed font-bold text-[15px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
        style={{ background: isComplete ? '#22C55E' : '#1E2A20', color: isComplete ? '#0A0F0C' : '#7A9E80', border: `1px solid ${isComplete ? '#22C55E' : '#243028'}` }}
      >
        {saving ? 'Saving…' : isComplete ? 'Save Squad' : `Save Squad (${total}/15)`}
      </button>

      {pickerOpen && (
        <PlayerPicker
          availablePlayers={poolLoading ? [] : playerPool}
          selectedIds={selectedIds}
          posFilter={pickerPosFilter}
          onSelect={addPlayer}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
