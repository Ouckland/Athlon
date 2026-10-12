import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { Competition, Season, Stage, ApiTeam } from '../lib/types';

// ─── Standings data contract ──────────────────────────────────────────────────
// StandingRow is the shape the UI expects.
// When a real endpoint exists, wire useStandings() to call it.
// Until then, the hook returns { rows: null, unavailable: true }.

export type StandingRow = {
  position: number;
  team: { id: number; name: string; short_name: string; logo: string | null };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
};

// Zone config — attach to a competition if applicable.
// Omit entirely for competitions with no promotion/relegation.
export type ZoneConfig = {
  label: string;
  color: string;
  positions: number[];  // 1-indexed positions in this zone
};

// ─── Demo data (isolated) ─────────────────────────────────────────────────────
// This data is for visual demonstration only.
// Replace by wiring useStandings() to the real backend when the endpoint ships.

const DEMO_ROWS: StandingRow[] = [
  { position: 1, team: { id: 1,  name: 'Riverside Athletic', short_name: 'RIV',  logo: null }, played: 10, won: 8, drawn: 1, lost: 1, goals_for: 24, goals_against: 8,  goal_difference: 16, points: 25, form: ['W','W','W','D','W'] },
  { position: 2, team: { id: 2,  name: 'Northgate FC',       short_name: 'NGT',  logo: null }, played: 10, won: 7, drawn: 2, lost: 1, goals_for: 21, goals_against: 10, goal_difference: 11, points: 23, form: ['W','D','W','W','W'] },
  { position: 3, team: { id: 3,  name: 'Eastbrook United',   short_name: 'EBK',  logo: null }, played: 10, won: 6, drawn: 2, lost: 2, goals_for: 18, goals_against: 11, goal_difference: 7,  points: 20, form: ['W','L','W','D','W'] },
  { position: 4, team: { id: 4,  name: 'Southfield City',    short_name: 'SFC',  logo: null }, played: 10, won: 5, drawn: 3, lost: 2, goals_for: 17, goals_against: 12, goal_difference: 5,  points: 18, form: ['D','W','W','D','L'] },
  { position: 5, team: { id: 5,  name: 'Westport Rangers',   short_name: 'WPR',  logo: null }, played: 10, won: 5, drawn: 1, lost: 4, goals_for: 15, goals_against: 14, goal_difference: 1,  points: 16, form: ['W','L','W','L','W'] },
  { position: 6, team: { id: 6,  name: 'Central Rovers',     short_name: 'CRV',  logo: null }, played: 10, won: 4, drawn: 3, lost: 3, goals_for: 14, goals_against: 13, goal_difference: 1,  points: 15, form: ['D','D','W','L','W'] },
  { position: 7, team: { id: 7,  name: 'Hillside Town',      short_name: 'HLT',  logo: null }, played: 10, won: 4, drawn: 2, lost: 4, goals_for: 13, goals_against: 15, goal_difference: -2, points: 14, form: ['L','W','D','W','L'] },
  { position: 8, team: { id: 8,  name: 'Ironbridge SC',      short_name: 'IRB',  logo: null }, played: 10, won: 3, drawn: 4, lost: 3, goals_for: 12, goals_against: 13, goal_difference: -1, points: 13, form: ['D','W','D','L','D'] },
  { position: 9, team: { id: 9,  name: 'Maplewood FC',       short_name: 'MPW',  logo: null }, played: 10, won: 3, drawn: 2, lost: 5, goals_for: 11, goals_against: 17, goal_difference: -6, points: 11, form: ['L','L','W','D','W'] },
  { position: 10, team: { id: 10, name: 'Lakeside United',   short_name: 'LKS',  logo: null }, played: 10, won: 2, drawn: 3, lost: 5, goals_for: 9,  goals_against: 18, goal_difference: -9, points: 9,  form: ['L','D','L','W','D'] },
  { position: 11, team: { id: 11, name: 'Harborview FC',     short_name: 'HBV',  logo: null }, played: 10, won: 2, drawn: 2, lost: 6, goals_for: 8,  goals_against: 19, goal_difference:-11, points: 8,  form: ['L','L','W','L','D'] },
  { position: 12, team: { id: 12, name: 'Cliffton Athletic', short_name: 'CLF',  logo: null }, played: 10, won: 1, drawn: 2, lost: 7, goals_for: 7,  goals_against: 22, goal_difference:-15, points: 5,  form: ['L','L','D','L','L'] },
];

// Demo zone config — disabled by default since we don't know competition rules.
// Enable and configure when connected to a real competition with known zones.
const DEMO_ZONES: ZoneConfig[] = [];
// Example of how to define zones when applicable:
// const DEMO_ZONES: ZoneConfig[] = [
//   { label: 'Promotion',  color: '#22C55E', positions: [1, 2] },
//   { label: 'Playoff',    color: '#FBBF24', positions: [3, 4, 5, 6] },
//   { label: 'Relegation', color: '#EF4444', positions: [11, 12] },
// ];

function useDemoStandings() {
  return { rows: DEMO_ROWS as StandingRow[], zones: DEMO_ZONES, unavailable: false, isDemo: true };
}

// ─── Team crest ───────────────────────────────────────────────────────────────

function TeamCrest({ team, size = 28 }: { team: StandingRow['team']; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = team.short_name.slice(0, 3).toUpperCase();

  if (!team.logo || err) {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" className="flex-shrink-0" aria-hidden>
        <defs>
          <clipPath id={`crest-clip-${team.id}`}>
            <path d="M14 1L26 6v10c0 6-6 10-12 11C8 26 2 22 2 16V6L14 1z" />
          </clipPath>
        </defs>
        <path d="M14 1L26 6v10c0 6-6 10-12 11C8 26 2 22 2 16V6L14 1z"
          fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
        <text x="14" y="16.5" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(34,197,94,0.8)"
          fontFamily="'Barlow Condensed', sans-serif" fontWeight="900"
          fontSize={initials.length > 2 ? "7" : "8"}>
          {initials}
        </text>
      </svg>
    );
  }
  return (
    <img src={team.logo} alt={team.short_name} onError={() => setErr(true)}
      width={size} height={size} className="object-contain flex-shrink-0" />
  );
}

// ─── Form dots ────────────────────────────────────────────────────────────────

function FormDots({ form }: { form: ('W' | 'D' | 'L')[] }) {
  const last5 = form.slice(-5);
  const color: Record<string, string> = { W: '#22C55E', D: '#FBBF24', L: '#EF4444' };
  return (
    <div className="flex items-center gap-0.5">
      {last5.map((r, i) => (
        <span key={i} className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ background: color[r] ?? '#243028', opacity: i === last5.length - 1 ? 1 : 0.55 }} />
      ))}
    </div>
  );
}

// ─── GD cell ─────────────────────────────────────────────────────────────────

function GDCell({ gd }: { gd: number }) {
  const color = gd > 0 ? '#22C55E' : gd < 0 ? '#EF4444' : '#7A9E80';
  return (
    <span className="font-mono tabular-nums text-[11px] sm:text-[12px]" style={{ color }}>
      {gd > 0 ? `+${gd}` : gd}
    </span>
  );
}

// ─── Zone indicator ───────────────────────────────────────────────────────────

function zoneFor(pos: number, zones: ZoneConfig[]): ZoneConfig | undefined {
  return zones.find(z => z.positions.includes(pos));
}

// ─── Demo banner ─────────────────────────────────────────────────────────────

function DemoBanner() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5"
      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round" className="flex-shrink-0">
        <circle cx="7" cy="7" r="6" />
        <path d="M7 4.5v3M7 9.5v.5" />
      </svg>
      <p className="text-[11px] font-mono leading-relaxed" style={{ color: '#FBBF24' }}>
        Standings endpoint not yet available · Table shows prototype data only
      </p>
    </div>
  );
}

// ─── Unavailable state ────────────────────────────────────────────────────────

function StandingsUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 px-6 text-center rounded-xl"
      style={{ background: '#111812', border: '1px solid #243028' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#22C55E" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
          <rect x="3" y="6" width="16" height="13" rx="1.5" />
          <path d="M3 10h16M7 6V3m8 3V3M7 14h2m2 0h2" />
        </svg>
      </div>
      <div>
        <h3 className="font-condensed font-black text-[20px] text-text-1 tracking-tight">Table Not Available</h3>
        <p className="text-[12px] text-text-3 mt-1.5 max-w-[240px] leading-relaxed">
          No standings data is connected for this selection yet.
        </p>
      </div>
    </div>
  );
}

// ─── Table skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse" style={{ border: '1px solid #243028' }}>
      <div className="h-9" style={{ background: '#0A0F0C', borderBottom: '1px solid #243028' }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3"
          style={{ background: i % 2 === 0 ? '#111812' : '#0A0F0C', borderTop: '1px solid rgba(36,48,40,0.4)' }}>
          <div className="w-5 h-3 bg-surface-3 rounded flex-shrink-0" />
          <div className="w-7 h-7 bg-surface-3 rounded flex-shrink-0" />
          <div className="flex-1 h-3 bg-surface-3 rounded" />
          <div className="hidden sm:flex gap-2">
            {[1,2,3,4,5,6,7].map(j => <div key={j} className="w-6 h-3 bg-surface-3 rounded" />)}
          </div>
          <div className="w-6 h-3 bg-surface-3 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

function StandingsTable({ rows, zones, highlightTeamId, onTeamClick }: {
  rows: StandingRow[];
  zones: ZoneConfig[];
  highlightTeamId?: number;
  onTeamClick: (teamId: number) => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #243028' }}>
      {/* ── Desktop header (hidden on very small screens) ── */}
      <div className="hidden sm:grid items-center px-3 py-2.5"
        style={{
          gridTemplateColumns: '2.2rem 2rem 1fr 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 3rem 4rem',
          background: '#0A0F0C', borderBottom: '1px solid #243028',
        }}>
        {/* Zone stripe placeholder */}
        <span />
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 text-center">#</span>
        <span className="font-condensed font-bold text-[9px] uppercase tracking-[0.14em] text-text-3">Club</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">P</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">W</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">D</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">L</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">GF</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">GA</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">GD</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 text-center">Form</span>
        <span className="font-condensed font-black text-[10px] uppercase tracking-[0.12em] text-text-1 text-center">Pts</span>
      </div>

      {/* ── Mobile header ── */}
      <div className="flex sm:hidden items-center px-3 py-2.5 gap-2"
        style={{ background: '#0A0F0C', borderBottom: '1px solid #243028' }}>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3 w-5 text-center flex-shrink-0">#</span>
        <span className="font-condensed font-bold text-[9px] uppercase tracking-[0.14em] text-text-3 flex-1">Club</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3 w-8 text-center flex-shrink-0">GD</span>
        <span className="font-condensed font-black text-[10px] uppercase tracking-[0.12em] text-text-1 w-8 text-center flex-shrink-0">Pts</span>
      </div>

      {rows.map((row, i) => {
        const zone = zoneFor(row.position, zones);
        const isHighlight = row.team.id === highlightTeamId;

        return (
          <button
            key={row.position}
            onClick={() => onTeamClick(row.team.id)}
            className="w-full text-left transition-colors group"
            style={{
              borderTop: i > 0 ? '1px solid rgba(36,48,40,0.45)' : undefined,
              background: isHighlight
                ? 'rgba(34,197,94,0.06)'
                : i % 2 === 0 ? '#111812' : '#0A0F0C',
            }}
            onMouseEnter={e => { if (!isHighlight) e.currentTarget.style.background = '#162019'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isHighlight ? 'rgba(34,197,94,0.06)' : i % 2 === 0 ? '#111812' : '#0A0F0C'; }}
          >
            {/* ── Desktop row ── */}
            <div className="hidden sm:grid items-center px-3 py-3"
              style={{ gridTemplateColumns: '2.2rem 2rem 1fr 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 2.4rem 3rem 4rem' }}>

              {/* Zone stripe */}
              <div className="flex items-center justify-center h-full">
                <div className="w-[3px] h-5 rounded-full"
                  style={{ background: zone ? zone.color : 'transparent' }} />
              </div>

              {/* Position */}
              <span className={`font-condensed font-black tabular-nums text-center text-sm ${isHighlight ? 'text-athlon' : 'text-text-2'}`}>
                {row.position}
              </span>

              {/* Team */}
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest team={row.team} size={26} />
                <div className="min-w-0">
                  <span className={`text-[13px] font-semibold truncate block leading-tight ${isHighlight ? 'text-athlon' : 'text-text-1'} group-hover:text-athlon transition-colors`}>
                    {row.team.name}
                  </span>
                </div>
              </div>

              {/* Stats */}
              {[row.played, row.won, row.drawn, row.lost, row.goals_for, row.goals_against].map((v, j) => (
                <span key={j} className="font-mono tabular-nums text-[12px] text-text-2 text-center">{v}</span>
              ))}
              <div className="flex justify-center"><GDCell gd={row.goal_difference} /></div>

              {/* Form */}
              <div className="flex justify-center"><FormDots form={row.form} /></div>

              {/* Points */}
              <span className={`font-condensed font-black tabular-nums text-[16px] text-center ${isHighlight ? 'text-athlon' : 'text-text-1'}`}>
                {row.points}
              </span>
            </div>

            {/* ── Mobile row ── */}
            <div className="flex sm:hidden items-center gap-2.5 px-3 py-3">
              {/* Zone stripe */}
              {zone && <div className="w-[2.5px] h-6 rounded-full flex-shrink-0" style={{ background: zone.color }} />}

              {/* Position */}
              <span className={`font-condensed font-black tabular-nums text-sm text-center w-5 flex-shrink-0 ${isHighlight ? 'text-athlon' : 'text-text-2'}`}>
                {row.position}
              </span>

              {/* Crest */}
              <TeamCrest team={row.team} size={24} />

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-semibold truncate block leading-tight ${isHighlight ? 'text-athlon' : 'text-text-1'}`}>
                  {row.team.name}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-[10px] text-text-3">{row.played}P</span>
                  <span className="font-mono text-[9px] text-text-3 opacity-40">·</span>
                  <FormDots form={row.form} />
                </div>
              </div>

              {/* GD */}
              <div className="w-8 text-center flex-shrink-0"><GDCell gd={row.goal_difference} /></div>

              {/* Points */}
              <span className={`font-condensed font-black tabular-nums text-[17px] text-center w-8 flex-shrink-0 ${isHighlight ? 'text-athlon' : 'text-text-1'}`}>
                {row.points}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Zone legend ──────────────────────────────────────────────────────────────

function ZoneLegend({ zones }: { zones: ZoneConfig[] }) {
  if (!zones.length) return null;
  return (
    <div className="flex flex-wrap gap-4 mt-4">
      {zones.map(z => (
        <span key={z.label} className="flex items-center gap-1.5 text-[10px] font-mono text-text-3">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: z.color }} />
          {z.label}
        </span>
      ))}
    </div>
  );
}

// ─── Selector components ──────────────────────────────────────────────────────

function Selector({ label, value, options, onChange, loading, disabled }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block font-mono text-[9px] uppercase tracking-[0.14em] text-text-3 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || loading || options.length === 0}
          className="w-full px-3 pr-8 py-2 text-[12px] outline-none rounded-lg appearance-none truncate"
          style={{
            background: '#111812',
            border: '1px solid #243028',
            color: value ? '#E2F2E8' : '#7A9E80',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {options.length === 0 && !loading && <option value="">—</option>}
          {loading && <option value="">Loading…</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6}
          strokeLinecap="round" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StandingsPage() {
  const navigate = useNavigate();

  // ── Context selectors (real API) ──
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons]           = useState<Season[]>([]);
  const [stages, setStages]             = useState<Stage[]>([]);

  const [selectedCompId, setSelectedCompId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedStageId, setSelectedStageId]   = useState('');

  const [loadingComps, setLoadingComps]     = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingStages, setLoadingStages]   = useState(false);
  const [contextError, setContextError]     = useState<string | null>(null);

  // ── Standings data (demo until real endpoint exists) ──
  const { rows, zones, isDemo } = useDemoStandings();
  const [tableLoading] = useState(false);

  // Load competitions on mount
  useEffect(() => {
    setLoadingComps(true);
    api.get<Competition[]>(API_PATHS.competitions.list)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCompetitions(list);
        if (list.length > 0) setSelectedCompId(String(list[0].id));
      })
      .catch(() => setContextError('Failed to load competitions'))
      .finally(() => setLoadingComps(false));
  }, []);

  // Load seasons when competition changes
  useEffect(() => {
    if (!selectedCompId) { setSeasons([]); return; }
    setLoadingSeasons(true);
    setSeasons([]);
    setSelectedSeasonId('');
    setStages([]);
    setSelectedStageId('');
    api.get<Season[]>(API_PATHS.seasons.list(Number(selectedCompId)))
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setSeasons(list);
        // Prefer current season
        const current = list.find(s => s.is_current) ?? list[0];
        if (current) setSelectedSeasonId(String(current.id));
      })
      .catch(() => {})
      .finally(() => setLoadingSeasons(false));
  }, [selectedCompId]);

  // Load stages when season changes
  useEffect(() => {
    if (!selectedSeasonId) { setStages([]); return; }
    setLoadingStages(true);
    setStages([]);
    setSelectedStageId('');
    api.get<Stage[]>(API_PATHS.stages.list(Number(selectedSeasonId)))
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setStages(list);
        if (list.length > 0) setSelectedStageId(String(list[list.length - 1].id));
      })
      .catch(() => {})
      .finally(() => setLoadingStages(false));
  }, [selectedSeasonId]);

  const selectedComp   = competitions.find(c => String(c.id) === selectedCompId);
  const selectedSeason = seasons.find(s => String(s.id) === selectedSeasonId);
  const selectedStage  = stages.find(s => String(s.id) === selectedStageId);

  const compOptions   = competitions.map(c => ({ value: String(c.id), label: c.name }));
  const seasonOptions = seasons.map(s => ({ value: String(s.id), label: s.name }));
  const stageOptions  = stages.map(s => ({
    value: String(s.id),
    label: s.name || `${s.kind_display}${s.number != null ? ` ${s.number}` : ''}`,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">

      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="font-condensed font-black text-[32px] text-text-1 tracking-tight leading-none uppercase">
          Standings
        </h1>
        <p className="text-[11px] font-mono text-text-3 mt-0.5">League table</p>
      </div>

      {/* ── Context selectors ── */}
      {contextError ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-[11px] font-mono" style={{ color: '#EF4444' }}>{contextError}</p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <Selector
            label="Competition"
            value={selectedCompId}
            options={compOptions}
            onChange={setSelectedCompId}
            loading={loadingComps}
          />
          <Selector
            label="Season"
            value={selectedSeasonId}
            options={seasonOptions}
            onChange={setSelectedSeasonId}
            loading={loadingSeasons}
            disabled={!selectedCompId}
          />
          {stageOptions.length > 0 && (
            <Selector
              label="Stage / Gameweek"
              value={selectedStageId}
              options={stageOptions}
              onChange={setSelectedStageId}
              loading={loadingStages}
              disabled={!selectedSeasonId}
            />
          )}
        </div>
      )}

      {/* ── Competition context strip ── */}
      {selectedComp && (
        <div className="flex items-center gap-2 mb-4 overflow-hidden">
          <div className="h-px flex-1" style={{ background: '#243028' }} />
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-condensed font-black text-[11px] tracking-[0.1em] uppercase text-text-1">
              {selectedComp.name}
            </span>
            {selectedSeason && (
              <span className="font-mono text-[10px] text-text-3">· {selectedSeason.name}</span>
            )}
            {selectedStage && (
              <span className="inline-flex items-center font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
                {selectedStage.name || `${selectedStage.kind_display}${selectedStage.number != null ? ` ${selectedStage.number}` : ''}`}
              </span>
            )}
          </div>
          <div className="h-px flex-1" style={{ background: '#243028' }} />
        </div>
      )}

      {/* ── Demo banner ── */}
      {isDemo && <DemoBanner />}

      {/* ── Table ── */}
      {tableLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <StandingsUnavailable />
      ) : (
        <>
          <StandingsTable
            rows={rows}
            zones={zones}
            onTeamClick={teamId => navigate(`/teams/${teamId}`)}
          />
          <ZoneLegend zones={zones} />
        </>
      )}

      {/* ── Footer note ── */}
      <p className="text-[10px] font-mono text-text-3 opacity-40 text-center mt-6">
        Table data will update automatically when the standings endpoint is connected.
      </p>
    </div>
  );
}
