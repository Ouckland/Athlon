import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompRef   { id: number; name: string; }
interface SeasonRef { id: number; name: string; slug?: string; status?: string; }

interface ApiStage {
  id: number;
  name: string;
  slug?: string;
  kind?: string;
  kind_display?: string;
  number?: number | null;
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

const KIND_OPTIONS = ['GAMEWEEK', 'ROUND'];

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ seasonId, onClose, onCreated }: {
  seasonId: number;
  onClose: () => void;
  onCreated: (s: ApiStage) => void;
}) {
  const [name,    setName]    = useState('');
  const [kind,    setKind]    = useState('GAMEWEEK');
  const [number,  setNumber]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), kind };
      if (number.trim()) body.number = Number(number);
      const stage = await api.post<ApiStage>(API_PATHS.stages.list(seasonId), body);
      onCreated(stage);
    } catch (err) { setError(fmtError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(10,15,12,0.85)', backdropFilter: 'blur(6px)', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#111812', border: '1px solid #243028', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <h2 className="font-condensed font-black text-[18px] text-text-1 tracking-tight uppercase">New Stage</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2">
            <AdminIcon name="x" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className={LC}>Stage Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Gameweek 1" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Kind</label>
              <select value={kind} onChange={e => setKind(e.target.value)} className={IC} style={IS} onFocus={focusOn} onBlur={focusOff}>
                {KIND_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={LC}>Number</label>
              <input type="number" value={number} onChange={e => setNumber(e.target.value)}
                placeholder="1" min="1" className={IC} style={IS} onFocus={focusOn} onBlur={focusOff} />
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
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text-1"
              style={{ border: '1px solid #243028' }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              {loading ? 'Creating…' : 'Create Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Kind badge ───────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind?: string }) {
  const color = kind === 'GAMEWEEK' ? '#22C55E' : kind === 'ROUND' ? '#3B82F6' : '#7A9E80';
  return (
    <span className="inline-flex items-center font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
      {kind ?? '—'}
    </span>
  );
}

// ─── Stage row ────────────────────────────────────────────────────────────────

function StageRow({ stage }: { stage: ApiStage }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0"
      style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#162019', color: '#40604A' }}>
        <AdminIcon name="layers" size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-condensed font-bold text-[14px] text-text-1 leading-tight">{stage.name}</p>
          <KindBadge kind={stage.kind_display ?? stage.kind} />
        </div>
        {stage.number != null && (
          <p className="text-[10px] font-mono text-text-3 mt-0.5">#{stage.number}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StagesPage() {
  const [comps,      setComps]      = useState<CompRef[]>([]);
  const [seasons,    setSeasons]    = useState<SeasonRef[]>([]);
  const [stages,     setStages]     = useState<ApiStage[]>([]);
  const [compId,     setCompId]     = useState<number | null>(null);
  const [seasonId,   setSeasonId]   = useState<number | null>(null);
  const [loadingC,   setLoadingC]   = useState(true);
  const [loadingS,   setLoadingS]   = useState(false);
  const [loadingSt,  setLoadingSt]  = useState(false);
  const [errorS,     setErrorS]     = useState<string | null>(null);
  const [errorSt,    setErrorSt]    = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get<unknown>(API_PATHS.competitions.list)
      .then(d => setComps(unwrap<CompRef>(d)))
      .finally(() => setLoadingC(false));
  }, []);

  useEffect(() => {
    if (compId === null) { setSeasons([]); setSeasonId(null); setStages([]); return; }
    setLoadingS(true); setErrorS(null);
    api.get<unknown>(API_PATHS.seasons.list(compId))
      .then(d => setSeasons(unwrap<SeasonRef>(d)))
      .catch(() => setErrorS('Failed to load seasons'))
      .finally(() => setLoadingS(false));
    setSeasonId(null); setStages([]);
  }, [compId]);

  useEffect(() => {
    if (seasonId === null) { setStages([]); return; }
    setLoadingSt(true); setErrorSt(null);
    api.get<unknown>(API_PATHS.stages.list(seasonId))
      .then(d => setStages(unwrap<ApiStage>(d)))
      .catch(() => setErrorSt('Failed to load stages'))
      .finally(() => setLoadingSt(false));
  }, [seasonId]);

  const createBtn = seasonId ? (
    <button onClick={() => setShowCreate(true)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] tracking-wide hover:opacity-90"
      style={{ background: '#22C55E', color: '#0A0F0C' }}>
      <AdminIcon name="plus" size={13} /> New Stage
    </button>
  ) : undefined;

  return (
    <AdminLayout title="Stages" action={createBtn}>
      {/* Competition selector */}
      <div className="mb-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-3 mb-2">Competition</p>
        {loadingC ? (
          <div className="h-10 rounded-xl animate-pulse" style={{ background: '#111812', border: '1px solid #243028' }} />
        ) : comps.length === 0 ? (
          <p className="text-[12px] font-mono text-text-3">No competitions. Create one first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {comps.map(c => (
              <button key={c.id} onClick={() => setCompId(compId === c.id ? null : c.id)}
                className="text-[11px] font-mono px-3 py-1.5 rounded-lg transition-colors"
                style={compId === c.id
                  ? { background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
                  : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Season selector */}
      {compId && (
        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-3 mb-2">Season</p>
          {loadingS ? (
            <div className="h-10 rounded-xl animate-pulse" style={{ background: '#111812', border: '1px solid #243028' }} />
          ) : errorS ? (
            <p className="text-[12px] font-mono text-red-400">{errorS}</p>
          ) : seasons.length === 0 ? (
            <p className="text-[12px] font-mono text-text-3">No seasons for this competition. Create one first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {seasons.map(s => (
                <button key={s.id} onClick={() => setSeasonId(seasonId === s.id ? null : s.id)}
                  className="text-[11px] font-mono px-3 py-1.5 rounded-lg transition-colors"
                  style={seasonId === s.id
                    ? { background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
                    : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stages */}
      {!seasonId ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#111812', border: '1px solid #243028', color: '#40604A' }}>
            <AdminIcon name="layers" size={18} />
          </div>
          <p className="text-[13px] text-text-3">Select a competition and season to view stages</p>
        </div>
      ) : loadingSt ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse border-b last:border-0"
              style={{ borderColor: 'rgba(36,48,40,0.5)' }}>
              <div className="w-8 h-8 rounded-lg bg-surface-3 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-3 rounded" style={{ width: '40%' }} />
                <div className="h-2.5 bg-surface-3 rounded" style={{ width: '20%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : errorSt ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span style={{ color: '#EF4444' }}><AdminIcon name="alert" size={24} /></span>
          <p className="text-[13px] text-text-3">{errorSt}</p>
        </div>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#111812', border: '1px solid #243028', color: '#40604A' }}>
            <AdminIcon name="layers" size={18} />
          </div>
          <div>
            <p className="text-[14px] font-medium text-text-2 mb-1">No stages yet</p>
            <p className="text-[12px] text-text-3">Create the first stage for this season.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-condensed font-bold text-[13px] hover:opacity-90"
            style={{ background: '#22C55E', color: '#0A0F0C' }}>
            <AdminIcon name="plus" size={13} /> New Stage
          </button>
        </div>
      ) : (
        <>
          <p className="text-[10px] font-mono text-text-3 mb-3">{stages.length} stage{stages.length !== 1 ? 's' : ''}</p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
            {stages.map(s => <StageRow key={s.id} stage={s} />)}
          </div>
        </>
      )}

      {showCreate && seasonId && (
        <CreateModal seasonId={seasonId} onClose={() => setShowCreate(false)}
          onCreated={stage => { setStages(prev => [...prev, stage]); setShowCreate(false); }} />
      )}
    </AdminLayout>
  );
}
