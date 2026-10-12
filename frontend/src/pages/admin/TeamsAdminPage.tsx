import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgRef  { id: number; name: string; slug?: string; }
interface CompRef { id: number; name: string; }

interface ApiTeamAdmin {
  id: number;
  name: string;
  slug?: string;
  short_name?: string;
  logo?: string | null;
  organization?: OrgRef | null;
  competitions?: CompRef[];
  captain?: { id: number; display_name: string } | null;
  created_at?: string;
}

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

const IC = 'w-full px-3 py-2.5 rounded-lg text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors';
const IS = { background: '#0A0F0C', border: '1px solid #243028' };
const LC = 'block text-[11px] font-mono text-text-3 mb-1.5 tracking-wide';
const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#22C55E60');
const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = '#243028');

// ─── Shield initials ──────────────────────────────────────────────────────────

function ShieldInitials({ name, size = 36 }: { name: string; size?: number }) {
  const initials = (name || '?').slice(0, 3).toUpperCase();
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden>
      <path d="M18 2L4 8v10c0 8 5.5 14 14 16 8.5-2 14-8 14-16V8L18 2Z" fill="#162019" stroke="#243028" strokeWidth="1" />
      <text x="18" y="21" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Barlow Condensed', sans-serif" fontWeight="900"
        fontSize={initials.length > 2 ? 9 : 12} fill="#22C55E">
        {initials}
      </text>
    </svg>
  );
}

function TeamCrestImg({ team, size = 36 }: { team: ApiTeamAdmin; size?: number }) {
  const [err, setErr] = useState(false);
  if (!team.logo || err) return <ShieldInitials name={team.short_name || team.name} size={size} />;
  return <img src={team.logo} alt={team.name} width={size} height={size} onError={() => setErr(true)} className="object-contain" style={{ width: size, height: size }} />;
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ orgs, onClose, onCreated }: {
  orgs: OrgRef[];
  onClose: () => void;
  onCreated: (t: ApiTeamAdmin) => void;
}) {
  const [name,       setName]       = useState('');
  const [slug,       setSlug]       = useState('');
  const [shortName,  setShortName]  = useState('');
  const [orgId,      setOrgId]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleName = (v: string) => {
    setName(v);
    setSlug(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), slug: slug.trim() };
      if (shortName.trim()) body.short_name = shortName.trim();
      if (orgId) body.organization_id = Number(orgId);
      const team = await api.post<ApiTeamAdmin>(API_PATHS.teams.list, body);
      onCreated(team);
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
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">New Team</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className={LC}>Team Name *</label>
            <input ref={ref} type="text" value={name} onChange={e => handleName(e.target.value)}
              placeholder="e.g. Lagos United FC" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Slug *</label>
              <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className={IC + ' font-mono'} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className={LC}>Short Name</label>
              <input type="text" value={shortName} onChange={e => setShortName(e.target.value.toUpperCase())}
                placeholder="LGU" maxLength={10} className={IC + ' font-mono'} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>
          <div>
            <label className={LC}>Organization</label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
              <option value="">— None —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
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
              {loading ? 'Creating…' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ team, onClose }: { team: ApiTeamAdmin; onClose: () => void }) {
  const [managers,  setManagers]  = useState<Manager[]>([]);
  const [loadingM,  setLoadingM]  = useState(true);
  const [removing,  setRemoving]  = useState<number | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    api.get<unknown>(API_PATHS.teams.managers(team.id))
      .then(d => setManagers(unwrap<Manager>(d)))
      .finally(() => setLoadingM(false));
  }, [team.id]);

  const removeManager = async (userId: number) => {
    if (!confirm('Remove this manager from the team?')) return;
    setRemoving(userId);
    try {
      await api.delete(API_PATHS.teams.managerItem(team.id, userId));
      setManagers(prev => prev.filter(m => m.user_id !== userId));
    } catch { alert('Failed to remove manager'); }
    finally { setRemoving(null); }
  };

  return (
    <div className="fixed inset-0" style={{ zIndex: 90 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,12,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="absolute top-0 right-0 h-full w-full max-w-sm flex flex-col overflow-hidden"
        style={{ background: '#0A0F0C', borderLeft: '1px solid #243028', boxShadow: '-32px 0 80px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#243028' }}>
          <div className="flex items-center gap-3">
            <TeamCrestImg team={team} size={32} />
            <div className="min-w-0">
              <p className="font-condensed font-black text-[15px] text-text-1 tracking-tight uppercase truncate">{team.name}</p>
              {team.short_name && <p className="font-mono text-[10px] text-text-3">{team.short_name}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-1 flex-shrink-0">
            <AdminIcon name="x" size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-5 px-5 space-y-5">
          {/* Info */}
          <section>
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">Details</p>
            <div className="space-y-2 rounded-xl p-3" style={{ background: '#111812', border: '1px solid #1E2A20' }}>
              {team.slug && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-text-3">Slug</span>
                  <code className="font-mono text-[11px] text-athlon">{team.slug}</code>
                </div>
              )}
              {team.organization && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-text-3">Organization</span>
                  <span className="text-[11px] text-text-2">{team.organization.name}</span>
                </div>
              )}
              {team.captain && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-text-3">Captain</span>
                  <span className="text-[11px] text-text-2">{team.captain.display_name}</span>
                </div>
              )}
            </div>
          </section>

          {/* Competitions */}
          {Array.isArray(team.competitions) && team.competitions.length > 0 && (
            <section>
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">Competitions ({team.competitions.length})</p>
              <div className="space-y-1.5">
                {team.competitions.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: '#111812', border: '1px solid #1E2A20' }}>
                    <span className="text-text-3"><AdminIcon name="trophy" size={11} /></span>
                    <span className="text-[12px] text-text-2">{c.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Managers */}
          <section>
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">
              Managers / Scouts {!loadingM && `(${managers.length})`}
            </p>
            {loadingM ? (
              <div className="space-y-1.5">{Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: '#111812' }} />
              ))}</div>
            ) : managers.length === 0 ? (
              <p className="text-[11px] font-mono text-text-3">No managers assigned. Use the Scouts section to assign.</p>
            ) : (
              <div className="space-y-1.5">
                {managers.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: '#111812', border: '1px solid #1E2A20' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>
                      <AdminIcon name="user" size={10} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-text-2 truncate">{m.display_name}</p>
                      {m.email && <p className="text-[10px] font-mono text-text-3 truncate">{m.email}</p>}
                    </div>
                    <button onClick={() => removeManager(m.user_id)} disabled={removing === m.user_id}
                      className="text-text-3 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0">
                      <AdminIcon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Team row ─────────────────────────────────────────────────────────────────

function TeamRow({ team, onSelect, isSelected }: {
  team: ApiTeamAdmin; onSelect: () => void; isSelected: boolean;
}) {
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-3.5 text-left group transition-colors"
      style={{ borderBottom: '1px solid rgba(36,48,40,0.5)', background: isSelected ? '#162019' : 'transparent' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#111812'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
      <div className="flex-shrink-0"><TeamCrestImg team={team} size={36} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className={`font-condensed font-bold text-[14px] leading-tight ${isSelected ? 'text-athlon' : 'text-text-1 group-hover:text-athlon'} transition-colors truncate`}>
            {team.name}
          </p>
          {team.short_name && <span className="font-mono text-[10px] text-text-3 flex-shrink-0">{team.short_name}</span>}
        </div>
        {team.organization && <p className="text-[10px] text-text-3 mt-0.5 truncate">{team.organization.name}</p>}
      </div>
      {Array.isArray(team.competitions) && team.competitions.length > 0 && (
        <span className="font-mono text-[10px] text-text-3 flex-shrink-0 hidden sm:block">
          {team.competitions.length} comp{team.competitions.length !== 1 ? 's' : ''}
        </span>
      )}
      <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-athlon' : 'text-text-3 opacity-0 group-hover:opacity-100'}`}>
        <AdminIcon name="chevron" size={12} />
      </span>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamsAdminPage() {
  const [teams,      setTeams]      = useState<ApiTeamAdmin[]>([]);
  const [orgs,       setOrgs]       = useState<OrgRef[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<ApiTeamAdmin | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    Promise.allSettled([
      api.get<unknown>(API_PATHS.teams.list),
      api.get<unknown>(API_PATHS.organizations.list),
    ]).then(([tr, or]) => {
      if (tr.status === 'fulfilled') setTeams(unwrap<ApiTeamAdmin>(tr.value));
      else setError('Failed to load teams');
      if (or.status === 'fulfilled') setOrgs(unwrap<OrgRef>(or.value));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = search.trim()
    ? teams.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.short_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.organization?.name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : teams;

  const createBtn = (
    <button onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
      style={{ background: '#22C55E', color: '#0A0F0C' }}>
      <AdminIcon name="plus" size={13} /> New Team
    </button>
  );

  return (
    <AdminLayout title="Teams" action={createBtn}>
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search teams…"
          className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
          style={{ background: '#111812', border: '1px solid #243028' }} />
      </div>

      {!loading && !error && (
        <p className="text-[10px] font-mono text-text-3 mb-3">
          {filtered.length === teams.length ? `${teams.length} team${teams.length !== 1 ? 's' : ''}` : `${filtered.length} of ${teams.length}`}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
              style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
              <div className="w-9 h-9 rounded-xl bg-surface-3 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-3 rounded" style={{ width: '40%' }} />
                <div className="h-2.5 bg-surface-3 rounded" style={{ width: '25%' }} />
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
            <AdminIcon name="shield" size={22} />
          </div>
          <p className="text-[14px] font-medium text-text-2">
            {search ? 'No teams match your search' : 'No teams yet'}
          </p>
          {!search && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              <AdminIcon name="plus" size={13} /> New Team
            </button>
          )}
          {search && <button onClick={() => setSearch('')} className="text-[12px] font-mono text-athlon hover:opacity-80">Clear</button>}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {filtered.map(t => (
            <TeamRow key={t.id} team={t} isSelected={selectedTeam?.id === t.id}
              onSelect={() => setSelectedTeam(selectedTeam?.id === t.id ? null : t)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal orgs={orgs} onClose={() => setShowCreate(false)}
          onCreated={team => { setTeams(prev => [team, ...prev]); setShowCreate(false); setSelectedTeam(team); }} />
      )}
      {selectedTeam && (
        <DetailPanel key={selectedTeam.id} team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      )}
    </AdminLayout>
  );
}
