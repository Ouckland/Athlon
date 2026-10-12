import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import type { Match, MatchStatus } from '../../lib/types';
import AdminLayout, { AdminIcon } from '../../components/admin/AdminLayout';

// ─── Stat card ────────────────────────────────────────────────────────────────

type StatState = { count: number | null; loading: boolean; error: boolean };

function StatCard({ label, icon, state, to }: {
  label: string; icon: string; state: StatState; to: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full text-left p-4 rounded-xl group transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: '#111812', border: '1px solid #243028' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#344A38')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#243028')}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>
          <AdminIcon name={icon} size={15} />
        </div>
        <span className="text-text-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <AdminIcon name="chevron" size={12} />
        </span>
      </div>

      {state.loading ? (
        <div className="h-7 w-12 bg-surface-3 rounded animate-pulse mb-1" />
      ) : state.error ? (
        <span className="text-[11px] font-mono text-text-3">—</span>
      ) : (
        <p className="font-condensed font-black text-[28px] text-text-1 leading-none tabular-nums mb-1">
          {state.count ?? '—'}
        </p>
      )}
      <p className="text-[11px] font-mono text-text-3">{label}</p>
    </button>
  );
}

// ─── Match status pill ────────────────────────────────────────────────────────

function StatusPill({ status }: { status: MatchStatus }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    LIVE:             { label: 'LIVE', color: '#EF4444', bg: 'rgba(239,68,68,0.1)'    },
    HALFTIME:         { label: 'HT',   color: '#FBBF24', bg: 'rgba(251,191,36,0.1)'   },
    SCHEDULED:        { label: 'UP',   color: '#7A9E80', bg: 'rgba(34,197,94,0.06)'   },
    FINISHED:         { label: 'FT',   color: '#40604A', bg: 'rgba(34,197,94,0.05)'   },
    POSTPONED:        { label: 'PST',  color: '#7A9E80', bg: '#111812'                 },
    CANCELLED:        { label: 'CAN',  color: '#EF4444', bg: 'rgba(239,68,68,0.06)'   },
  };
  const c = cfg[status] ?? { label: status, color: '#7A9E80', bg: '#111812' };
  return (
    <span className="inline-flex items-center font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}25` }}>
      {c.label}
    </span>
  );
}

// ─── Recent matches ───────────────────────────────────────────────────────────

function RecentMatches() {
  const navigate = useNavigate();
  const [matches, setMatches]   = useState<Match[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    api.get<Match[] | { results: Match[] }>(API_PATHS.matches.list)
      .then(d => {
        const list = Array.isArray(d) ? d : (d as { results: Match[] }).results ?? [];
        const order: Record<string, number> = {
          LIVE: 0, HALFTIME: 0,
          SCHEDULED: 1, FINISHED: 2, POSTPONED: 3, CANCELLED: 4,
        };
        setMatches(list.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5)).slice(0, 6));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-condensed font-black text-[16px] text-text-1 tracking-tight">Recent Matches</h2>
        <button onClick={() => navigate('/admin/matches')}
          className="text-[11px] font-mono text-athlon hover:opacity-80 transition-opacity">
          All →
        </button>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 animate-pulse"
              style={{ borderBottomColor: 'rgba(36,48,40,0.5)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }}>
              <div className="w-10 h-2.5 bg-surface-3 rounded flex-shrink-0" />
              <div className="flex-1 h-3 bg-surface-3 rounded" />
            </div>
          ))
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] font-mono text-text-3">Failed to load matches</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] font-mono text-text-3">No matches yet</p>
          </div>
        ) : (
          matches.map((m, i) => {
            const score = m.home_score != null && m.away_score != null
              ? `${m.home_score}–${m.away_score}` : 'vs';
            const kickoff = m.kickoff_at
              ? new Date(m.kickoff_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : null;
            return (
              <button key={m.id}
                onClick={() => navigate(`/scout/matches/${m.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left group border-b last:border-0 transition-colors hover:bg-surface-2"
                style={{ borderBottomColor: 'rgba(36,48,40,0.5)', background: i % 2 === 0 ? '#111812' : '#0A0F0C' }}>
                <StatusPill status={m.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-text-1 truncate">
                    {m.home_team.name}
                    <span className="font-mono text-[11px] text-text-3 mx-1.5">{score}</span>
                    {m.away_team.name}
                  </p>
                </div>
                {kickoff && <span className="text-[10px] font-mono text-text-3 flex-shrink-0">{kickoff}</span>}
                <span className="text-text-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <AdminIcon name="chevron" size={11} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'New Team',        to: '/admin/teams',        icon: 'shield'   },
  { label: 'New Player',      to: '/admin/players',      icon: 'user'     },
  { label: 'New Match',       to: '/admin/matches',      icon: 'flag'     },
  { label: 'New Competition', to: '/admin/competitions', icon: 'trophy'   },
  { label: 'New Season',      to: '/admin/seasons',      icon: 'calendar' },
  { label: 'Manage Scouts',   to: '/admin/scouts',       icon: 'eye'      },
];

function QuickActions() {
  const navigate = useNavigate();
  return (
    <section>
      <h2 className="font-condensed font-black text-[16px] text-text-1 tracking-tight mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_ACTIONS.map(({ label, to, icon }) => (
          <button key={to} onClick={() => navigate(to)}
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-[12px] font-medium text-text-2 hover:text-text-1 transition-colors group"
            style={{ background: '#111812', border: '1px solid #243028' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#344A38')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#243028')}
          >
            <span className="text-text-3 group-hover:text-athlon transition-colors flex-shrink-0">
              <AdminIcon name={icon} size={13} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Dashboard overview ───────────────────────────────────────────────────────

function fetchStat(
  path: string,
  setter: React.Dispatch<React.SetStateAction<StatState>>,
) {
  api.get<unknown[] | { count?: number; results?: unknown[] }>(path)
    .then(d => {
      let count: number;
      if (Array.isArray(d)) count = d.length;
      else if (typeof d === 'object' && d !== null && typeof (d as { count?: number }).count === 'number')
        count = (d as { count: number }).count;
      else if (typeof d === 'object' && d !== null && Array.isArray((d as { results?: unknown[] }).results))
        count = ((d as { results: unknown[] }).results).length;
      else count = 0;
      setter({ count, loading: false, error: false });
    })
    .catch(() => setter({ count: null, loading: false, error: true }));
}

export default function AdminDashboard() {
  const [orgs,    setOrgs]    = useState<StatState>({ count: null, loading: true, error: false });
  const [comps,   setComps]   = useState<StatState>({ count: null, loading: true, error: false });
  const [teams,   setTeams]   = useState<StatState>({ count: null, loading: true, error: false });
  const [players, setPlayers] = useState<StatState>({ count: null, loading: true, error: false });
  const [matches, setMatches] = useState<StatState>({ count: null, loading: true, error: false });

  useEffect(() => {
    fetchStat(API_PATHS.organizations.list, setOrgs);
    fetchStat(API_PATHS.competitions.list,  setComps);
    fetchStat(API_PATHS.teams.list,         setTeams);
    fetchStat(API_PATHS.players.list,       setPlayers);
    fetchStat(API_PATHS.matches.list,       setMatches);
  }, []);

  const STATS = [
    { label: 'Organizations', icon: 'building', state: orgs,    to: '/admin/organizations' },
    { label: 'Competitions',  icon: 'trophy',   state: comps,   to: '/admin/competitions'  },
    { label: 'Teams',         icon: 'shield',   state: teams,   to: '/admin/teams'         },
    { label: 'Players',       icon: 'user',     state: players, to: '/admin/players'       },
    { label: 'Matches',       icon: 'flag',     state: matches, to: '/admin/matches'       },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-8 animate-fade-in">
        <section>
          <h2 className="font-condensed font-black text-[16px] text-text-1 tracking-tight mb-3">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STATS.map(s => <StatCard key={s.to} {...s} />)}
          </div>
        </section>
        <QuickActions />
        <RecentMatches />
      </div>
    </AdminLayout>
  );
}
