import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgRef { id: number; name: string; slug: string; }
interface TeamRef { id: number; name: string; short_name?: string; }

interface ApiCompetition {
  id: number;
  name: string;
  slug?: string;
  short_name?: string;
  code?: string;
  type?: string;
  status?: string;
  country?: string;
  organization?: OrgRef;
  logo?: string | null;
  created_at?: string;
}

interface CompetitionDetail extends ApiCompetition {
  teams?: TeamRef[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(data: T[] | { results: T[] } | unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in (data as object)) {
    return ((data as { results: T[] }).results) ?? [];
  }
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
const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.currentTarget.style.borderColor = '#22C55E60');
const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.currentTarget.style.borderColor = '#243028');

const TYPE_OPTIONS   = ['LEAGUE', 'CUP'];
const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'COMPLETED'];

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status?: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    ACTIVE:    { label: 'ACTIVE',    color: '#22C55E', bg: 'rgba(34,197,94,0.1)'  },
    COMPLETED: { label: 'COMPLETED', color: '#7A9E80', bg: 'rgba(34,197,94,0.05)' },
    DRAFT:     { label: 'DRAFT',     color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
  };
  const c = cfg[status ?? ''] ?? { label: status ?? '—', color: '#7A9E80', bg: '#111812' };
  return (
    <span className="inline-flex items-center font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}30` }}>
      {c.label}
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ orgs, onClose, onCreated }: {
  orgs: OrgRef[];
  onClose: () => void;
  onCreated: (c: ApiCompetition) => void;
}) {
  const [name,    setName]    = useState('');
  const [slug,    setSlug]    = useState('');
  const [code,    setCode]    = useState('');
  const [type,    setType]    = useState('LEAGUE');
  const [status,  setStatus]  = useState('DRAFT');
  const [country, setCountry] = useState('');
  const [orgId,   setOrgId]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
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
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), slug: slug.trim(), type, status };
      if (code.trim())    body.code    = code.trim();
      if (country.trim()) body.country = country.trim();
      if (orgId)          body.organization_id = Number(orgId);
      const comp = await api.post<ApiCompetition>(API_PATHS.competitions.list, body);
      onCreated(comp);
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
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">New Competition</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className={LC}>Name *</label>
            <input ref={ref} type="text" value={name} onChange={e => handleName(e.target.value)}
              placeholder="e.g. Premier League" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Slug *</label>
              <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="premier-league" className={IC + ' font-mono'} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className={LC}>Code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="PL" maxLength={10} className={IC + ' font-mono'} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={LC}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Country</label>
              <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                placeholder="Nigeria" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className={LC}>Organization</label>
              <select value={orgId} onChange={e => setOrgId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                <option value="">— None —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
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
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text-1 transition-colors"
              style={{ border: '1px solid #243028' }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-opacity disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Creating…' : 'Create Competition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add team modal ───────────────────────────────────────────────────────────

function AddTeamModal({ competitionId, existingTeamIds, onClose, onAdded }: {
  competitionId: number;
  existingTeamIds: number[];
  onClose: () => void;
  onAdded: (team: TeamRef) => void;
}) {
  const [teams,   setTeams]   = useState<TeamRef[]>([]);
  const [teamId,  setTeamId]  = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching,setFetching]= useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    api.get<unknown>(API_PATHS.teams.list).then(d => {
      setTeams(unwrap<TeamRef>(d).filter(t => !existingTeamIds.includes(t.id)));
    }).finally(() => setFetching(false));
  }, [existingTeamIds]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) { setError('Select a team'); return; }
    setLoading(true); setError(null);
    try {
      await api.post(API_PATHS.competitions.teams(competitionId), { team_id: Number(teamId) });
      const t = teams.find(x => x.id === Number(teamId))!;
      onAdded(t);
    } catch (err) { setError(fmtError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 110 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[16px] text-text-1 tracking-tight uppercase">Add Team</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2"><AdminIcon name="x" size={13} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className={LC}>Select Team</label>
            {fetching ? (
              <div className="h-10 rounded-lg animate-pulse" style={{ background: '#162019' }} />
            ) : (
              <select value={teamId} onChange={e => setTeamId(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                <option value="">— Choose team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.short_name ? ` (${t.short_name})` : ''}</option>)}
              </select>
            )}
          </div>
          {teams.length === 0 && !fetching && (
            <p className="text-[11px] font-mono text-text-3">All teams are already participating.</p>
          )}
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text-1"
              style={{ border: '1px solid #243028' }}>Cancel</button>
            <button type="submit" disabled={loading || fetching || teams.length === 0}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Adding…' : 'Add Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ compId, onClose }: { compId: number; onClose: () => void }) {
  const [comp,       setComp]       = useState<CompetitionDetail | null>(null);
  const [teams,      setTeams]      = useState<TeamRef[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [removing,   setRemoving]   = useState<number | null>(null);
  const [showAddTeam,setShowAddTeam]= useState(false);

  const loadDetail = () => {
    setLoading(true);
    Promise.allSettled([
      api.get<CompetitionDetail>(API_PATHS.competitions.detail(compId)),
      api.get<unknown>(API_PATHS.competitions.teams(compId)),
    ]).then(([cr, tr]) => {
      if (cr.status === 'fulfilled') setComp(cr.value);
      if (tr.status === 'fulfilled') setTeams(unwrap<TeamRef>(tr.value));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadDetail(); }, [compId]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const removeTeam = async (teamId: number) => {
    if (!confirm('Remove this team from the competition?')) return;
    setRemoving(teamId);
    try {
      await api.delete(API_PATHS.competitions.teamRemove(compId, teamId));
      setTeams(prev => prev.filter(t => t.id !== teamId));
    } catch {
      alert('Failed to remove team');
    } finally { setRemoving(null); }
  };

  return (
    <div className="fixed inset-0" style={{ zIndex: 90 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,12,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="absolute top-0 right-0 h-full w-full max-w-sm flex flex-col overflow-hidden"
        style={{ background: '#0A0F0C', borderLeft: '1px solid #243028', boxShadow: '-32px 0 80px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#243028' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>
              <AdminIcon name="trophy" size={14} />
            </div>
            <span className="font-condensed font-black text-[16px] text-text-1 tracking-tight uppercase truncate">
              {loading ? 'Loading…' : (comp?.name ?? 'Competition')}
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-1 flex-shrink-0">
            <AdminIcon name="x" size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-5 px-5 space-y-5">
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 rounded animate-pulse" style={{ background: '#162019', width: i % 2 ? '60%' : '40%' }} />
            ))}</div>
          ) : comp ? (
            <>
              <section>
                <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">Details</p>
                <div className="space-y-2 rounded-xl p-3" style={{ background: '#111812', border: '1px solid #1E2A20' }}>
                  {comp.code && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-3">Code</span>
                      <code className="font-mono text-[11px] text-athlon">{comp.code}</code>
                    </div>
                  )}
                  {comp.type && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-3">Type</span>
                      <span className="text-[11px] text-text-2">{comp.type}</span>
                    </div>
                  )}
                  {comp.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-3">Status</span>
                      <StatusPill status={comp.status} />
                    </div>
                  )}
                  {comp.country && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-3">Country</span>
                      <span className="text-[11px] text-text-2">{comp.country}</span>
                    </div>
                  )}
                  {comp.organization && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-3">Organization</span>
                      <span className="text-[11px] text-text-2">{comp.organization.name}</span>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3">
                    Teams ({teams.length})
                  </p>
                  <button onClick={() => setShowAddTeam(true)}
                    className="flex items-center gap-1 text-[10px] font-mono text-athlon hover:opacity-80">
                    <AdminIcon name="plus" size={10} /> Add
                  </button>
                </div>
                {teams.length === 0 ? (
                  <p className="text-[11px] font-mono text-text-3">No teams assigned yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {teams.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: '#111812', border: '1px solid #1E2A20' }}>
                        <span className="text-text-3"><AdminIcon name="shield" size={11} /></span>
                        <span className="text-[12px] text-text-2 flex-1 min-w-0 truncate">{t.name}</span>
                        {t.short_name && <span className="text-[9px] font-mono text-text-3">{t.short_name}</span>}
                        <button onClick={() => removeTeam(t.id)} disabled={removing === t.id}
                          className="text-text-3 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0">
                          <AdminIcon name="x" size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="text-[12px] font-mono text-text-3">Failed to load competition</p>
          )}
        </div>
      </div>

      {showAddTeam && comp && (
        <AddTeamModal
          competitionId={compId}
          existingTeamIds={teams.map(t => t.id)}
          onClose={() => setShowAddTeam(false)}
          onAdded={team => { setTeams(prev => [...prev, team]); setShowAddTeam(false); }}
        />
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CompRow({ comp, onSelect, isSelected }: {
  comp: ApiCompetition; onSelect: () => void; isSelected: boolean;
}) {
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-3.5 text-left group transition-colors"
      style={{ borderBottom: '1px solid rgba(36,48,40,0.5)', background: isSelected ? '#162019' : 'transparent' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#111812'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: isSelected ? 'rgba(34,197,94,0.15)' : '#162019', color: isSelected ? '#22C55E' : '#40604A' }}>
        <AdminIcon name="trophy" size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-condensed font-bold text-[14px] leading-tight ${isSelected ? 'text-athlon' : 'text-text-1 group-hover:text-athlon'} transition-colors`}>
            {comp.name}
          </p>
          {comp.code && <code className="font-mono text-[10px] text-text-3">{comp.code}</code>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {comp.status && <StatusPill status={comp.status} />}
          {comp.type && <span className="text-[10px] font-mono text-text-3">{comp.type}</span>}
          {comp.country && <span className="text-[10px] font-mono text-text-3">{comp.country}</span>}
        </div>
      </div>
      <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-athlon' : 'text-text-3 opacity-0 group-hover:opacity-100'}`}>
        <AdminIcon name="chevron" size={12} />
      </span>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetitionsPage() {
  const [comps,      setComps]      = useState<ApiCompetition[]>([]);
  const [orgs,       setOrgs]       = useState<OrgRef[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    Promise.allSettled([
      api.get<unknown>(API_PATHS.competitions.list),
      api.get<unknown>(API_PATHS.organizations.list),
    ]).then(([cr, or]) => {
      if (cr.status === 'fulfilled') setComps(unwrap<ApiCompetition>(cr.value));
      else setError('Failed to load competitions');
      if (or.status === 'fulfilled') setOrgs(unwrap<OrgRef>(or.value));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = search.trim()
    ? comps.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.country ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : comps;

  const createBtn = (
    <button onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
      style={{ background: '#22C55E', color: '#0A0F0C' }}>
      <AdminIcon name="plus" size={13} /> New Competition
    </button>
  );

  return (
    <AdminLayout title="Competitions" action={createBtn}>
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search competitions…"
          className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
          style={{ background: '#111812', border: '1px solid #243028' }} />
      </div>

      {!loading && !error && (
        <p className="text-[10px] font-mono text-text-3 mb-3">
          {filtered.length === comps.length ? `${comps.length} competition${comps.length !== 1 ? 's' : ''}` : `${filtered.length} of ${comps.length}`}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
              style={{ borderColor: 'rgba(36,48,40,0.5)', background: i % 2 ? '#111812' : 'transparent' }}>
              <div className="w-9 h-9 rounded-xl bg-surface-3 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-3 rounded" style={{ width: '45%' }} />
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
            <AdminIcon name="trophy" size={22} />
          </div>
          <p className="text-[14px] font-medium text-text-2">
            {search ? 'No competitions match your search' : 'No competitions yet'}
          </p>
          {!search && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              <AdminIcon name="plus" size={13} /> New Competition
            </button>
          )}
          {search && <button onClick={() => setSearch('')} className="text-[12px] font-mono text-athlon hover:opacity-80">Clear search</button>}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {filtered.map(c => (
            <CompRow key={c.id} comp={c} isSelected={selectedId === c.id}
              onSelect={() => setSelectedId(selectedId === c.id ? null : c.id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal orgs={orgs} onClose={() => setShowCreate(false)}
          onCreated={comp => { setComps(prev => [comp, ...prev]); setShowCreate(false); setSelectedId(comp.id); }} />
      )}
      {selectedId !== null && (
        <DetailPanel key={selectedId} compId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </AdminLayout>
  );
}
