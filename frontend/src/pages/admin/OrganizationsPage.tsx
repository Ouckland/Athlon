import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Organization {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

interface OrgDetail extends Organization {
  competitions?: { id: number; name: string }[];
  teams?: { id: number; name: string; short_name?: string }[];
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateOrgModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (org: Organization) => void;
}) {
  const [name,        setName]        = useState('');
  const [slug,        setSlug]        = useState('');
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }

    setLoading(true);
    try {
      const org = await api.post<Organization>(API_PATHS.organizations.list, {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
      });
      onCreated(org);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create organization';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const labelCls = 'block text-[11px] font-mono text-text-3 mb-1.5 tracking-wide';
  const inputCls = 'w-full px-3 py-2.5 rounded-lg text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors';
  const inputStyle = { background: '#0A0F0C', border: '1px solid #243028' };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 100 }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">
            New Organization
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors">
            <AdminIcon name="x" size={13} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className={labelCls}>Organization Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Premier League Africa"
              className={inputCls}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E60')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
          </div>

          <div>
            <label className={labelCls}>Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="premier-league-africa"
              className={inputCls + ' font-mono'}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E60')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
            <p className="text-[10px] font-mono text-text-3 mt-1">URL-friendly identifier. Lowercase letters, numbers, hyphens only.</p>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description of this organization…"
              rows={3}
              className={inputCls + ' resize-none'}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E60')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
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
              style={{ border: '1px solid #243028' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-opacity disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function OrgDetailPanel({ orgId, onClose }: { orgId: number; onClose: () => void }) {
  const [org,     setOrg]     = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api.get<OrgDetail>(API_PATHS.organizations.detail(orgId))
      .then(setOrg)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orgId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 90 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,12,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      {/* Panel — slides in from the right */}
      <div
        className="absolute top-0 right-0 h-full w-full max-w-sm flex flex-col overflow-hidden"
        style={{ background: '#0A0F0C', borderLeft: '1px solid #243028', boxShadow: '-32px 0 80px rgba(0,0,0,0.5)' }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#243028' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>
              <AdminIcon name="building" size={14} />
            </div>
            <span className="font-condensed font-black text-[16px] text-text-1 tracking-tight uppercase truncate">
              {loading ? 'Loading…' : (org?.name ?? 'Organization')}
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-1 transition-colors flex-shrink-0">
            <AdminIcon name="x" size={13} />
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto py-5 px-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 rounded animate-pulse" style={{ background: '#162019', width: i % 2 === 0 ? '70%' : '50%' }} />
              ))}
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-[12px] font-mono text-text-3 mb-3">Failed to load organization</p>
              <button onClick={() => { setError(false); setLoading(true); api.get<OrgDetail>(API_PATHS.organizations.detail(orgId)).then(setOrg).catch(() => setError(true)).finally(() => setLoading(false)); }}
                className="text-[11px] font-mono text-athlon hover:opacity-80">
                Retry →
              </button>
            </div>
          ) : org ? (
            <>
              {/* Slug */}
              <section>
                <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">Identifier</p>
                <code className="font-mono text-[12px] px-2.5 py-1.5 rounded" style={{ background: '#111812', color: '#22C55E', border: '1px solid #243028' }}>
                  {org.slug}
                </code>
              </section>

              {/* Description */}
              {org.description && (
                <section>
                  <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">Description</p>
                  <p className="text-[13px] text-text-2 leading-relaxed">{org.description}</p>
                </section>
              )}

              {/* Competitions */}
              <section>
                <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">
                  Competitions
                  {Array.isArray(org.competitions) && org.competitions.length > 0 && (
                    <span className="ml-1.5 text-text-3 normal-case tracking-normal">({org.competitions.length})</span>
                  )}
                </p>
                {Array.isArray(org.competitions) && org.competitions.length > 0 ? (
                  <div className="space-y-1.5">
                    {org.competitions.map(c => (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: '#111812', border: '1px solid #243028' }}>
                        <span className="text-text-3"><AdminIcon name="trophy" size={11} /></span>
                        <span className="text-[12px] text-text-2">{c.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-mono text-text-3">No competitions yet</p>
                )}
              </section>

              {/* Teams */}
              <section>
                <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-3 mb-2">
                  Teams
                  {Array.isArray(org.teams) && org.teams.length > 0 && (
                    <span className="ml-1.5 text-text-3 normal-case tracking-normal">({org.teams.length})</span>
                  )}
                </p>
                {Array.isArray(org.teams) && org.teams.length > 0 ? (
                  <div className="space-y-1.5">
                    {org.teams.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: '#111812', border: '1px solid #243028' }}>
                        <span className="text-text-3"><AdminIcon name="shield" size={11} /></span>
                        <span className="text-[12px] text-text-2 flex-1 min-w-0 truncate">{t.name}</span>
                        {t.short_name && <span className="text-[9px] font-mono text-text-3 flex-shrink-0">{t.short_name}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-mono text-text-3">No teams yet</p>
                )}
              </section>

              {/* Timestamps */}
              {(org.created_at || org.updated_at) && (
                <section className="pt-2 border-t" style={{ borderColor: '#1E2A20' }}>
                  {org.created_at && (
                    <p className="text-[10px] font-mono text-text-3">
                      Created {new Date(org.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                  {org.updated_at && (
                    <p className="text-[10px] font-mono text-text-3">
                      Updated {new Date(org.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Org row ──────────────────────────────────────────────────────────────────

function OrgRow({ org, onSelect, isSelected }: {
  org: Organization; onSelect: () => void; isSelected: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-3.5 text-left group transition-colors"
      style={{
        borderBottom: '1px solid rgba(36,48,40,0.5)',
        background: isSelected ? '#162019' : 'transparent',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#111812'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ background: isSelected ? 'rgba(34,197,94,0.15)' : '#162019', color: isSelected ? '#22C55E' : '#40604A' }}>
        <AdminIcon name="building" size={15} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`font-condensed font-bold text-[14px] leading-tight transition-colors ${isSelected ? 'text-athlon' : 'text-text-1 group-hover:text-athlon'}`}>
          {org.name}
        </p>
        <p className="font-mono text-[10px] text-text-3 mt-0.5">{org.slug}</p>
      </div>

      {org.description && (
        <p className="hidden sm:block text-[11px] text-text-3 truncate max-w-[200px] flex-shrink-0">
          {org.description}
        </p>
      )}

      <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-athlon' : 'text-text-3 opacity-0 group-hover:opacity-100'}`}>
        <AdminIcon name="chevron" size={12} />
      </span>
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
          style={{ borderColor: 'rgba(36,48,40,0.5)', background: i % 2 === 0 ? '#111812' : 'transparent' }}>
          <div className="w-9 h-9 rounded-xl bg-surface-3 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-surface-3 rounded" style={{ width: '40%' }} />
            <div className="h-2.5 bg-surface-3 rounded" style={{ width: '25%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const [orgs,       setOrgs]       = useState<Organization[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.get<Organization[] | { results: Organization[] }>(API_PATHS.organizations.list)
      .then(d => {
        const list = Array.isArray(d) ? d : (d as { results: Organization[] }).results ?? [];
        setOrgs(list);
      })
      .catch(() => setError('Failed to load organizations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = search.trim()
    ? orgs.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.slug.toLowerCase().includes(search.toLowerCase()) ||
        (o.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : orgs;

  const handleCreated = (org: Organization) => {
    setOrgs(prev => [org, ...prev]);
    setShowCreate(false);
    setSelectedId(org.id);
  };

  const createBtn = (
    <button
      onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide transition-opacity hover:opacity-90 active:opacity-80"
      style={{ background: '#22C55E', color: '#0A0F0C' }}
    >
      <AdminIcon name="plus" size={13} />
      New Organization
    </button>
  );

  return (
    <AdminLayout title="Organizations" action={createBtn}>
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search organizations…"
            className="w-full pl-8 pr-4 py-2.5 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-xl"
            style={{ background: '#111812', border: '1px solid #243028' }} />
        </div>
      </div>

      {/* Status line */}
      {!loading && !error && (
        <p className="text-[10px] font-mono text-text-3 mb-3">
          {filtered.length === orgs.length
            ? `${orgs.length} organization${orgs.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${orgs.length}`}
        </p>
      )}

      {/* Content */}
      {loading ? (
        <Skeleton />
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
            <AdminIcon name="building" size={22} />
          </div>
          <div>
            <p className="text-[14px] font-medium text-text-2 mb-1">
              {search ? 'No organizations match your search' : 'No organizations yet'}
            </p>
            {!search && (
              <p className="text-[12px] text-text-3">Create your first organization to get started.</p>
            )}
          </div>
          {!search && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              <AdminIcon name="plus" size={13} />
              New Organization
            </button>
          )}
          {search && (
            <button onClick={() => setSearch('')} className="text-[12px] font-mono text-athlon hover:opacity-80">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {filtered.map(org => (
            <OrgRow
              key={org.id}
              org={org}
              isSelected={selectedId === org.id}
              onSelect={() => setSelectedId(selectedId === org.id ? null : org.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {selectedId !== null && (
        <OrgDetailPanel key={selectedId} orgId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </AdminLayout>
  );
}
