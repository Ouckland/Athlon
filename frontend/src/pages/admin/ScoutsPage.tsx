import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamRef { id: number; name: string; short_name?: string; }

interface Manager {
  user_id: number;
  display_name: string;
  email?: string;
  role?: string;
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

const IC = 'w-full px-3 py-2.5 rounded-lg text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors font-mono';
const IS = { background: '#0A0F0C', border: '1px solid #243028' };
const LC = 'block text-[11px] font-mono text-text-3 mb-1.5 tracking-wide';

// ─── Assign modal ─────────────────────────────────────────────────────────────

function AssignModal({ teamId, teamName, existingIds, onClose, onAssigned }: {
  teamId: number;
  teamName: string;
  existingIds: number[];
  onClose: () => void;
  onAssigned: (manager: Manager) => void;
}) {
  const [userId,  setUserId]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = Number(userId.trim());
    if (!uid || isNaN(uid) || uid <= 0) { setError('Please enter a valid numeric User ID'); return; }
    if (existingIds.includes(uid)) { setError('This user is already a manager for this team'); return; }
    setLoading(true); setError(null);
    try {
      const manager = await api.post<Manager>(API_PATHS.teams.managers(teamId), { user_id: uid });
      onAssigned(manager);
    } catch (err) { setError(fmtError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[16px] text-text-1 tracking-tight uppercase">Assign Scout</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg"
            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span className="flex-shrink-0 mt-0.5" style={{ color: '#FBBF24' }}><AdminIcon name="alert" size={12} /></span>
            <p className="text-[11px] text-text-3 leading-relaxed">
              There is no user-search API available. You must know the user's numeric ID in advance.
              Ask the user to share it from their profile, or look it up in the Django admin.
            </p>
          </div>
          <div>
            <label className={LC}>Assigning to: <span className="text-text-2">{teamName}</span></label>
          </div>
          <div>
            <label className={LC}>User ID *</label>
            <input type="number" value={userId} onChange={e => setUserId(e.target.value)}
              placeholder="123" min="1" className={IC} style={IS}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E60')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
              autoFocus />
            <p className="text-[10px] font-mono text-text-3 mt-1">The numeric user ID from the system.</p>
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
              {loading ? 'Assigning…' : 'Assign Scout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Manager card ─────────────────────────────────────────────────────────────

function ManagerCard({ manager, teamId, onRemoved }: {
  manager: Manager; teamId: number; onRemoved: (userId: number) => void;
}) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!confirm(`Remove ${manager.display_name} as manager of this team?`)) return;
    setRemoving(true);
    try {
      await api.delete(API_PATHS.teams.managerItem(teamId, manager.user_id));
      onRemoved(manager.user_id);
    } catch { alert('Failed to remove manager'); }
    finally { setRemoving(false); }
  };

  const initials = (manager.display_name || '?').split(' ').filter(w => w.length > 0).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: '#111812', border: '1px solid #1E2A20' }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <span className="font-condensed font-black text-[12px] text-athlon">{initials || '?'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-1 truncate">{manager.display_name}</p>
        {manager.email && <p className="text-[10px] font-mono text-text-3 truncate">{manager.email}</p>}
        {manager.role && <p className="text-[10px] font-mono text-text-3">{manager.role}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="font-mono text-[10px] text-text-3">ID: {manager.user_id}</span>
        <button onClick={handleRemove} disabled={removing}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40">
          <AdminIcon name="x" size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Team section ─────────────────────────────────────────────────────────────

function TeamManagersSection({ team }: { team: TeamRef }) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    api.get<unknown>(API_PATHS.teams.managers(team.id))
      .then(d => setManagers(unwrap<Manager>(d)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [team.id]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
      {/* Team header */}
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left group transition-colors hover:bg-surface-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#162019', color: '#40604A' }}>
          <AdminIcon name="shield" size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-condensed font-bold text-[14px] text-text-1 group-hover:text-athlon transition-colors">{team.name}</p>
            {team.short_name && <span className="font-mono text-[10px] text-text-3">{team.short_name}</span>}
          </div>
          {!loading && (
            <p className="text-[10px] font-mono text-text-3 mt-0.5">
              {error ? 'Failed to load' : `${managers.length} manager${managers.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        <button onClick={e => { e.stopPropagation(); setShowAdd(true); }}
          className="flex items-center gap-1 text-[10px] font-mono text-athlon hover:opacity-80 flex-shrink-0"
          title="Add manager">
          <AdminIcon name="plus" size={11} /> Add
        </button>
        <span className={`text-text-3 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
          <AdminIcon name="chevron" size={12} />
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-2 border-t" style={{ borderColor: 'rgba(36,48,40,0.5)', background: '#0A0F0C' }}>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: '#111812' }} />
            ))}</div>
          ) : error ? (
            <div className="flex items-center gap-2 py-3">
              <span style={{ color: '#EF4444' }}><AdminIcon name="alert" size={13} /></span>
              <p className="text-[12px] text-text-3">Failed to load managers</p>
              <button onClick={load} className="text-[11px] font-mono text-athlon hover:opacity-80 ml-auto">Retry</button>
            </div>
          ) : managers.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[12px] font-mono text-text-3 mb-2">No managers assigned</p>
              <button onClick={() => setShowAdd(true)}
                className="text-[11px] font-mono text-athlon hover:opacity-80">
                + Assign a scout/manager
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {managers.map(m => (
                <ManagerCard key={m.user_id} manager={m} teamId={team.id}
                  onRemoved={uid => setManagers(prev => prev.filter(x => x.user_id !== uid))} />
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AssignModal
          teamId={team.id}
          teamName={team.name}
          existingIds={managers.map(m => m.user_id)}
          onClose={() => setShowAdd(false)}
          onAssigned={m => { setManagers(prev => [...prev, m]); setShowAdd(false); setExpanded(true); }}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScoutsPage() {
  const [teams,   setTeams]   = useState<TeamRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    api.get<unknown>(API_PATHS.teams.list)
      .then(d => setTeams(unwrap<TeamRef>(d)))
      .catch(() => setError('Failed to load teams'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.short_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : teams;

  return (
    <AdminLayout title="Scouts">
      {/* Info notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <span className="flex-shrink-0 mt-0.5" style={{ color: '#3B82F6' }}><AdminIcon name="alert" size={14} /></span>
        <div>
          <p className="text-[12px] font-medium text-text-2 mb-1">About Scout / Manager Assignments</p>
          <p className="text-[11px] text-text-3 leading-relaxed">
            Scouts are assigned per-team as managers. To assign a scout, expand a team and click Add.
            You must know the user's numeric ID — there is no user-search endpoint available.
            Users can share their ID from their account profile.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter teams…"
          className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
          style={{ background: '#111812', border: '1px solid #243028' }} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[60px] rounded-xl animate-pulse" style={{ background: '#111812', border: '1px solid #243028' }} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span style={{ color: '#EF4444' }}><AdminIcon name="alert" size={28} /></span>
          <p className="text-[13px] text-text-3">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#111812', border: '1px solid #243028', color: '#40604A' }}>
            <AdminIcon name="eye" size={18} />
          </div>
          <p className="text-[13px] text-text-3">
            {search ? 'No teams match your search' : 'No teams available. Create teams first.'}
          </p>
          {search && <button onClick={() => setSearch('')} className="text-[12px] font-mono text-athlon hover:opacity-80">Clear</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {!loading && !error && (
            <p className="text-[10px] font-mono text-text-3 mb-2">
              {filtered.length} team{filtered.length !== 1 ? 's' : ''} · click to expand managers
            </p>
          )}
          {filtered.map(t => <TeamManagersSection key={t.id} team={t} />)}
        </div>
      )}
    </AdminLayout>
  );
}
