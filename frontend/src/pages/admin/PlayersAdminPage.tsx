import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamRef { id: number; name: string; short_name?: string; slug?: string; }

interface ApiPlayerAdmin {
  id: number;
  first_name: string;
  last_name: string;
  display_name: string;
  shirt_number?: number | null;
  position?: string;
  position_display?: string;
  photo?: string | null;
  team?: TeamRef | null;
  user_id?: number | null;
  created_at?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'results' in (data as object))
    return ((data as { results: T[] }).results) ?? [];
  return [];
}

function fmtError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const d = (err as { data: Record<string, unknown> }).data;
    if (typeof d['detail'] === 'string') return d['detail'];
    const parts: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
      else if (typeof v === 'string') parts.push(v);
    }
    if (parts.length) return parts.join(' · ');
  }
  return err instanceof Error ? err.message : 'An error occurred';
}

const IC = 'w-full px-3 py-2.5 rounded-lg text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors';
const IS = { background: '#0A0F0C', border: '1px solid #243028' };
const LC = 'block text-[11px] font-mono text-text-3 mb-1.5 tracking-wide';
const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#22C55E60');
const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#243028');

const POSITIONS = ['GK', 'DEF', 'MID', 'ATT'] as const;
type Pos = typeof POSITIONS[number];

const POS_COLOR: Record<Pos, string> = {
  GK:  '#FBBF24',
  DEF: '#3B82F6',
  MID: '#22C55E',
  ATT: '#EF4444',
};

// ─── Player avatar ────────────────────────────────────────────────────────────

function PlayerAvatar({ player, size = 36 }: { player: ApiPlayerAdmin; size?: number }) {
  const [err, setErr] = useState(false);
  const pos = (player.position ?? 'MID') as Pos;
  const color = POS_COLOR[pos] ?? '#22C55E';
  const initials = (player.display_name || '?').split(' ').filter(w => w.length > 0).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (player.photo && !err) {
    return (
      <img src={player.photo} alt={player.display_name} onError={() => setErr(true)}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: `${color}18`, border: `1.5px solid ${color}40` }}>
      <span className="font-condensed font-black text-[11px]" style={{ color }}>{initials || '?'}</span>
    </div>
  );
}

// ─── Position badge ───────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos?: string }) {
  const p = (pos ?? 'MID') as Pos;
  const color = POS_COLOR[p] ?? '#22C55E';
  return (
    <span className="inline-flex items-center font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
      {pos ?? '—'}
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ teams, onClose, onCreated }: {
  teams: TeamRef[];
  onClose: () => void;
  onCreated: (p: ApiPlayerAdmin) => void;
}) {
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [displayName,setDisplayName]= useState('');
  const [position,   setPosition]   = useState<Pos>('MID');
  const [shirtNum,   setShirtNum]   = useState('');
  const [teamId,     setTeamId]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Auto-fill display name
  const handleFirstName = (v: string) => {
    setFirstName(v);
    if (!displayName || displayName === `${firstName} ${lastName}`.trim())
      setDisplayName(`${v} ${lastName}`.trim());
  };
  const handleLastName = (v: string) => {
    setLastName(v);
    if (!displayName || displayName === `${firstName} ${lastName}`.trim())
      setDisplayName(`${firstName} ${v}`.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() && !displayName.trim()) { setError('First name or display name is required'); return; }
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName.trim() || `${firstName} ${lastName}`.trim(),
        position,
      };
      if (shirtNum.trim()) body.shirt_number = Number(shirtNum);
      if (teamId) body.team_id = Number(teamId);
      const player = await api.post<ApiPlayerAdmin>(API_PATHS.players.list, body);
      onCreated(player);
    } catch (err) { setError(fmtError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 overflow-y-auto py-8"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">New Player</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>First Name</label>
              <input ref={ref} type="text" value={firstName} onChange={e => handleFirstName(e.target.value)}
                placeholder="Emeka" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className={LC}>Last Name</label>
              <input type="text" value={lastName} onChange={e => handleLastName(e.target.value)}
                placeholder="Okonkwo" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>
          <div>
            <label className={LC}>Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Emeka Okonkwo" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Position</label>
              <select value={position} onChange={e => setPosition(e.target.value as Pos)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={LC}>Shirt Number</label>
              <input type="number" value={shirtNum} onChange={e => setShirtNum(e.target.value)}
                placeholder="10" min="1" max="99" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>
          <div>
            <label className={LC}>Team</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
              <option value="">— Unattached —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.short_name ? ` (${t.short_name})` : ''}</option>)}
            </select>
          </div>
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }}><AdminIcon name="alert" size={12} /></span>
              <p className="text-[12px] text-red-400 leading-snug">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text-1"
              style={{ border: '1px solid #243028' }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Creating…' : 'Create Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({ player }: { player: ApiPlayerAdmin }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0"
      style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
      <PlayerAvatar player={player} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-condensed font-bold text-[14px] text-text-1 leading-tight truncate">{player.display_name}</p>
          <PosBadge pos={player.position_display ?? player.position} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {player.team && <p className="text-[10px] text-text-3 truncate">{player.team.name}</p>}
          {player.shirt_number != null && (
            <span className="font-mono text-[10px] text-text-3">#{player.shirt_number}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayersAdminPage() {
  const [players,    setPlayers]    = useState<ApiPlayerAdmin[]>([]);
  const [teams,      setTeams]      = useState<TeamRef[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [posFilter,  setPosFilter]  = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    Promise.allSettled([
      api.get<unknown>(API_PATHS.players.list),
      api.get<unknown>(API_PATHS.teams.list),
    ]).then(([pr, tr]) => {
      if (pr.status === 'fulfilled') setPlayers(unwrap<ApiPlayerAdmin>(pr.value));
      else setError('Failed to load players');
      if (tr.status === 'fulfilled') setTeams(unwrap<TeamRef>(tr.value));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = players.filter(p => {
    if (search && !p.display_name.toLowerCase().includes(search.toLowerCase()) &&
      !(p.team?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (teamFilter && String(p.team?.id ?? '') !== teamFilter) return false;
    if (posFilter && p.position !== posFilter) return false;
    return true;
  });

  const createBtn = (
    <button onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
      style={{ background: '#22C55E', color: '#0A0F0C' }}>
      <AdminIcon name="plus" size={13} /> New Player
    </button>
  );

  return (
    <AdminLayout title="Players" action={createBtn}>
      {/* Search + filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
            style={{ background: '#111812', border: '1px solid #243028' }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Position filter */}
          {['', ...POSITIONS].map(p => (
            <button key={p || 'all'} onClick={() => setPosFilter(p)}
              className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors"
              style={posFilter === p
                ? { background: `${p ? POS_COLOR[p as Pos] : '#22C55E'}20`, color: p ? POS_COLOR[p as Pos] : '#22C55E', border: `1px solid ${p ? POS_COLOR[p as Pos] : '#22C55E'}40` }
                : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
              {p || 'All'}
            </button>
          ))}
          {/* Team filter */}
          {teams.length > 0 && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className="text-[10px] font-mono px-2.5 py-1 rounded-full outline-none"
              style={{ background: teamFilter ? 'rgba(34,197,94,0.1)' : '#111812', color: teamFilter ? '#22C55E' : '#7A9E80', border: teamFilter ? '1px solid rgba(34,197,94,0.3)' : '1px solid #243028' }}>
              <option value="">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.short_name || t.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {!loading && !error && (
        <p className="text-[10px] font-mono text-text-3 mb-3">
          {filtered.length === players.length ? `${players.length} player${players.length !== 1 ? 's' : ''}` : `${filtered.length} of ${players.length}`}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
              style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
              <div className="w-9 h-9 rounded-full bg-surface-3 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-3 rounded" style={{ width: '45%' }} />
                <div className="h-2.5 bg-surface-3 rounded" style={{ width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span style={{ color: '#EF4444' }}><AdminIcon name="alert" size={28} /></span>
          <p className="text-[13px] text-text-3">{error}</p>
          <button onClick={load} className="px-4 py-2 text-[12px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: '#111812', border: '1px solid #243028', color: '#40604A' }}>
            <AdminIcon name="user" size={22} />
          </div>
          <p className="text-[14px] font-medium text-text-2">
            {search || teamFilter || posFilter ? 'No players match your filters' : 'No players yet'}
          </p>
          {(search || teamFilter || posFilter) && (
            <button onClick={() => { setSearch(''); setTeamFilter(''); setPosFilter(''); }}
              className="text-[12px] font-mono text-athlon hover:opacity-80">Clear filters</button>
          )}
          {!search && !teamFilter && !posFilter && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              <AdminIcon name="plus" size={13} /> New Player
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {filtered.map(p => <PlayerRow key={p.id} player={p} />)}
        </div>
      )}

      {showCreate && (
        <CreateModal teams={teams} onClose={() => setShowCreate(false)}
          onCreated={player => { setPlayers(prev => [player, ...prev]); setShowCreate(false); }} />
      )}
    </AdminLayout>
  );
}
