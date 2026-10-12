import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { ApiTeam } from '../lib/types';

// ─── Shield crest fallback ────────────────────────────────────────────────────

function ShieldCrest({ initials, size = 56 }: { initials: string; size?: number }) {
  const id = `shield-${initials}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d="M28 2L6 10v18c0 13.5 9.5 23.5 22 26 12.5-2.5 22-12.5 22-26V10L28 2Z" />
        </clipPath>
      </defs>
      <path d="M28 2L6 10v18c0 13.5 9.5 23.5 22 26 12.5-2.5 22-12.5 22-26V10L28 2Z"
        fill="#162019" stroke="#243028" strokeWidth="1.5" />
      <text x="28" y="32" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Barlow Condensed', sans-serif" fontWeight="900"
        fontSize={initials.length > 2 ? 12 : 16} fill="#22C55E" letterSpacing="0.05em">
        {initials}
      </text>
    </svg>
  );
}

function TeamCrest({ team, size = 56 }: { team: ApiTeam; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = (team.short_name || team.name || '?').slice(0, 3).toUpperCase();
  if (!team.logo || err) return <ShieldCrest initials={initials} size={size} />;
  return (
    <img src={team.logo} alt={team.name} onError={() => setErr(true)}
      width={size} height={size}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }} />
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TeamsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl h-[88px]"
          style={{ background: '#111812', border: '1px solid #243028' }} />
      ))}
    </div>
  );
}

// ─── Team Card ────────────────────────────────────────────────────────────────

function TeamCard({ team, onClick }: { team: ApiTeam; onClick: () => void }) {
  const captainInitials = team.captain
    ? team.captain.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl group transition-all duration-150 active:scale-[0.98]"
      style={{ background: '#111812', border: '1px solid #243028' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#344A38')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#243028')}
    >
      {/* Crest */}
      <div className="flex-shrink-0">
        <TeamCrest team={team} size={52} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="font-condensed font-bold text-[15px] text-text-1 leading-tight group-hover:text-athlon transition-colors truncate">
            {team.name}
          </p>
          <span className="font-mono text-[10px] text-text-3 flex-shrink-0 hidden sm:block">{team.short_name}</span>
        </div>

        <p className="text-[10px] text-text-3 mt-0.5 truncate">{team.organization?.name}</p>

        {Array.isArray(team.competitions) && team.competitions.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {team.competitions.slice(0, 2).map(c => (
              <span key={c.id}
                className="inline-block text-[9px] font-mono px-1.5 py-0.5 rounded tracking-wide"
                style={{ background: '#1E2A20', color: '#7A9E80', border: '1px solid #243028' }}>
                {c.name}
              </span>
            ))}
            {team.competitions.length > 2 && (
              <span className="text-[9px] font-mono text-text-3">+{team.competitions.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Captain initials badge */}
      {captainInitials && (
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: '#22C55E18', border: '1px solid #22C55E30' }}>
            <span className="font-condensed font-black text-[10px] text-athlon">{captainInitials}</span>
          </div>
          <span className="text-[7px] font-mono text-text-3 uppercase tracking-wider">CPT</span>
        </div>
      )}

      {/* Chevron */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        className="text-text-3 flex-shrink-0 opacity-0 group-hover:opacity-100 group-hover:text-athlon transition-all">
        <path d="M4 2l4 4-4 4" />
      </svg>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string>('');

  useEffect(() => {
    setIsLoading(true);
    api.get<ApiTeam[] | { results: ApiTeam[] }>(API_PATHS.teams.list)
      .then(data => {
        const list = Array.isArray(data) ? data : (data as { results: ApiTeam[] }).results ?? [];
        setTeams(list);
        setError(null);
      })
      .catch(() => setError('Failed to load teams'))
      .finally(() => setIsLoading(false));
  }, []);

  const orgs = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of teams) {
      const name = t.organization?.name;
      if (name && !seen.has(name)) { seen.add(name); result.push(name); }
    }
    return result;
  }, [teams]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return teams.filter(t => {
      const matchSearch = !q
        || t.name?.toLowerCase().includes(q)
        || (t.short_name ?? '').toLowerCase().includes(q)
        || (t.organization?.name ?? '').toLowerCase().includes(q);
      const matchOrg = !orgFilter || t.organization?.name === orgFilter;
      return matchSearch && matchOrg;
    });
  }, [teams, search, orgFilter]);

  const retry = () => {
    setError(null);
    setIsLoading(true);
    api.get<ApiTeam[] | { results: ApiTeam[] }>(API_PATHS.teams.list)
      .then(data => {
        const list = Array.isArray(data) ? data : (data as { results: ApiTeam[] }).results ?? [];
        setTeams(list);
        setError(null);
      })
      .catch(() => setError('Failed to load teams'))
      .finally(() => setIsLoading(false));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="font-condensed font-black text-[32px] text-text-1 tracking-tight leading-none uppercase">
              Teams
            </h1>
            {!isLoading && !error && (
              <p className="text-[11px] font-mono text-text-3 mt-0.5">
                {filtered.length === teams.length
                  ? `${teams.length} team${teams.length !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${teams.length}`}
              </p>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search teams…"
              className="pl-8 pr-3 py-2 text-[12px] text-text-1 placeholder-text-3 outline-none rounded-lg w-40"
              style={{ background: '#111812', border: '1px solid #243028' }} />
          </div>
        </div>

        {/* Org filter pills — only when multiple orgs */}
        {orgs.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setOrgFilter('')}
              className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors"
              style={!orgFilter
                ? { background: '#22C55E20', color: '#22C55E', border: '1px solid #22C55E40' }
                : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
              All
            </button>
            {orgs.map(org => (
              <button key={org} onClick={() => setOrgFilter(org === orgFilter ? '' : org)}
                className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors truncate max-w-[160px]"
                style={orgFilter === org
                  ? { background: '#22C55E20', color: '#22C55E', border: '1px solid #22C55E40' }
                  : { background: '#111812', color: '#7A9E80', border: '1px solid #243028' }}>
                {org}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <TeamsSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg className="w-8 h-8 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
            <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-[13px] text-text-3">{error}</p>
          <button onClick={retry}
            className="min-h-[44px] px-4 text-[12px] font-mono text-athlon hover:opacity-80 transition-opacity">
            Retry →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg className="w-8 h-8 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
          </svg>
          <p className="text-[13px] text-text-3">
            {search || orgFilter ? 'No teams match your filter' : 'No teams registered yet'}
          </p>
          {(search || orgFilter) && (
            <button onClick={() => { setSearch(''); setOrgFilter(''); }}
              className="min-h-[44px] px-4 text-[12px] font-mono text-athlon hover:opacity-80 transition-opacity">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          {filtered.map(team => (
            <TeamCard key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
