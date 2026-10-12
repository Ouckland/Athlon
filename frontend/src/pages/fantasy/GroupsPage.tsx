import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { FantasyGroup } from '../../lib/types';

// ─── Create Group Modal ───────────────────────────────────────────────────────

function CreateGroupModal({ onCreated, onClose }: { onCreated: (g: FantasyGroup) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError('');
    try {
      const g = await api.post<FantasyGroup>(API_PATHS.fantasy.groups, { name: trimmed });
      onCreated(g);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(
          typeof d['detail'] === 'string' ? d['detail'] :
          typeof d['name'] === 'string' ? d['name'] :
          Array.isArray(d['name']) ? String(d['name'][0]) :
          `Error ${err.status}`
        );
      } else {
        setError('Failed to create group. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden animate-fade-up"
        style={{ background: '#111812', border: '1px solid #243028' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <div>
            <h2 className="font-condensed font-black text-[20px] text-text-1 tracking-tight">Create Group</h2>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">Give your group a name</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text-1 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-[12px] font-mono"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              {error}
            </div>
          )}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Group Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Friends League" maxLength={50} required
              className="w-full px-3 py-2.5 text-[13px] text-text-1 placeholder-text-3 outline-none rounded-lg transition-colors"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
          </div>
          <button type="submit" disabled={!name.trim() || submitting}
            className="w-full py-3 rounded-lg font-condensed font-bold text-[14px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: '#22C55E', color: '#0A0F0C' }}>
            {submitting ? 'Creating…' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Join Group Modal ─────────────────────────────────────────────────────────

function JoinGroupModal({ onJoined, onClose }: { onJoined: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(API_PATHS.fantasy.groupJoin, { invite_code: trimmed });
      onJoined();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.data as Record<string, unknown>;
        setError(
          typeof d['detail'] === 'string' ? d['detail'] :
          typeof d['invite_code'] === 'string' ? d['invite_code'] :
          Array.isArray(d['invite_code']) ? String(d['invite_code'][0]) :
          `Error ${err.status}`
        );
      } else {
        setError('Failed to join group. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden animate-fade-up"
        style={{ background: '#111812', border: '1px solid #243028' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#243028' }}>
          <div>
            <h2 className="font-condensed font-black text-[20px] text-text-1 tracking-tight">Join Group</h2>
            <p className="text-[11px] font-mono text-text-3 mt-0.5">Enter an invite code</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text-1 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-[12px] font-mono"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              {error}
            </div>
          )}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 mb-1.5">Invite Code</label>
            <input
              type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB12CD34" maxLength={16} required
              className="w-full px-3 py-2.5 text-[13px] text-text-1 placeholder-text-3 outline-none rounded-lg font-mono tracking-widest transition-colors"
              style={{ background: '#0A0F0C', border: '1px solid #243028' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#22C55E')}
              onBlur={e => (e.currentTarget.style.borderColor = '#243028')}
            />
          </div>
          <button type="submit" disabled={!code.trim() || submitting}
            className="w-full py-3 rounded-lg font-condensed font-bold text-[14px] tracking-[0.08em] disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: '#22C55E', color: '#0A0F0C' }}>
            {submitting ? 'Joining…' : 'Join Group'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onClick }: { group: FantasyGroup; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl overflow-hidden group transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: '#111812', border: '1px solid #243028' }}
    >
      <div className="h-px w-full" style={{ background: 'rgba(34,197,94,0.3)' }} />
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#22C55E" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="5" r="2.5" />
            <circle cx="3.5" cy="12" r="2" />
            <circle cx="14.5" cy="12" r="2" />
            <path d="M6.5 5.5L3.5 10M11.5 5.5L14.5 10M6.5 12h5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-condensed font-black text-[17px] text-text-1 tracking-tight truncate group-hover:text-athlon transition-colors">
            {group.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-mono text-text-3">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
            {group.invite_code && (
              <>
                <span className="text-[10px] font-mono text-text-3 opacity-40">·</span>
                <span className="text-[10px] font-mono tracking-widest" style={{ color: '#243028' }}>{group.invite_code}</span>
              </>
            )}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
          className="text-text-3 group-hover:text-athlon transition-colors flex-shrink-0">
          <path d="M4 2l5 5-5 5" />
        </svg>
      </div>
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<FantasyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  function loadGroups() {
    setIsLoading(true);
    setError(null);
    api.get<FantasyGroup[]>(API_PATHS.fantasy.groups)
      .then(data => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load groups'))
      .finally(() => setIsLoading(false));
  }

  useEffect(loadGroups, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none">Groups</h1>
          <p className="text-[11px] font-mono text-text-3 mt-0.5">Compete with friends and rivals.</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setShowCreate(true)}
          className="flex-1 py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-90 transition-opacity"
          style={{ background: '#22C55E', color: '#0A0F0C' }}
        >
          + Create Group
        </button>
        <button
          onClick={() => setShowJoin(true)}
          className="flex-1 py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-80 transition-opacity"
          style={{ background: '#111812', color: '#22C55E', border: '1px solid #243028' }}
        >
          Join by Code
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#111812', border: '1px solid #243028' }}>
          <p className="text-[13px] font-mono text-live mb-2">{error}</p>
          <button onClick={loadGroups} className="text-[11px] font-mono text-athlon hover:opacity-80">Retry →</button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center py-16 px-6 text-center rounded-2xl" style={{ background: '#111812', border: '1px dashed #243028' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#22C55E" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="6" r="3" />
              <circle cx="4" cy="15" r="2.5" />
              <circle cx="18" cy="15" r="2.5" />
              <path d="M8 7L4 12.5M14 7l4 5.5M8 15h6" />
            </svg>
          </div>
          <h2 className="font-condensed font-black text-[22px] text-text-1 tracking-tight mb-2">No groups yet</h2>
          <p className="text-[12px] text-text-3 leading-relaxed mb-6 max-w-[260px]">
            Create a private group or join one with an invite code to compete with friends.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-[220px]">
            <button onClick={() => setShowCreate(true)}
              className="py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-90 transition-opacity"
              style={{ background: '#22C55E', color: '#0A0F0C' }}>
              Create a Group
            </button>
            <button onClick={() => setShowJoin(true)}
              className="py-2.5 rounded-xl font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-80 transition-opacity"
              style={{ background: 'transparent', color: '#22C55E', border: '1px solid #243028' }}>
              Join by Code
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <GroupCard key={g.id} group={g} onClick={() => navigate(`/app/fantasy/groups/${g.id}`)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateGroupModal
          onCreated={g => { setGroups(prev => [...prev, g]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showJoin && (
        <JoinGroupModal
          onJoined={() => { setShowJoin(false); loadGroups(); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
