// Athlon frontend types — aligned with Django REST Framework backend field names.
// Field names match the actual API response structure.

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'SCOUT' | 'ADMIN';

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar: string | null;
  role: UserRole;
  email_verified: boolean;
  created_at: string;
};

// ─── Organization ─────────────────────────────────────────────────────────────

export type Organization = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
};

// ─── Competition ──────────────────────────────────────────────────────────────

export type CompetitionCode = 'PL' | 'UCL' | 'UEL' | 'LL' | 'BL' | 'SA' | 'L1' | 'FAC' | 'EFL' | string;

export type Competition = {
  id: number;
  name: string;
  short_name: string;
  code: CompetitionCode;
  country: string;
  logo_url: string | null;
};

// ─── Season ───────────────────────────────────────────────────────────────────

export type Season = {
  id: number;
  name: string;
  competition: number;
  is_current: boolean;
};

// ─── Stage (Gameweek) ─────────────────────────────────────────────────────────

export type Stage = {
  id: number;
  kind: string;           // e.g. 'GAMEWEEK'
  kind_display: string;   // e.g. 'Gameweek'
  number: number | null;  // gameweek / matchday number
  name: string;           // optional human label
};

// ─── Team ─────────────────────────────────────────────────────────────────────

export type Team = {
  id: number;
  name: string;
  short_name: string;
  abbreviation: string;
  crest_url: string | null;
  color_primary: string;
  color_secondary: string;
};

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerPosition = 'GKP' | 'DEF' | 'MID' | 'FWD';

export type Player = {
  id: number;
  team: Team | number;
  first_name: string;
  last_name: string;
  display_name: string;
  position: PlayerPosition;
  jersey_number: number | null;
  photo_url: string | null;
};

// ─── Match ────────────────────────────────────────────────────────────────────

export type MatchStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'HALFTIME'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED';

export type MatchEventType =
  | 'GOAL'
  | 'YELLOW'
  | 'RED'
  | 'SUBSTITUTION'
  | 'HALFTIME'
  | 'FULLTIME';

export type MatchEventPlayer = {
  id: number;
  display_name: string;
  position: string;
};

export type MatchEvent = {
  id: number;
  type: MatchEventType;
  type_display: string;
  minute: number;
  team: { id: number; name: string; short_name: string };
  player: MatchEventPlayer | null;
  related_player: MatchEventPlayer | null;
  description: string;
  created_at: string;
};

export type Match = {
  id: number;
  competition: Competition;
  stage: Stage | null;
  home_team: Team;
  away_team: Team;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  status_display: string;
  minute: number | null;
  kickoff_at: string;     // ISO 8601
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Standings ────────────────────────────────────────────────────────────────

export type StandingRow = {
  position: number;
  team: Team;
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

// ─── Fantasy ──────────────────────────────────────────────────────────────────

export type FantasyTeam = {
  id: number;
  name: string;
  owner: number;
  competition: number;
  total_points: number;
};

export type FantasyLeaderboardEntry = {
  rank: number;
  fantasy_team: FantasyTeam;
  total_points: number;
};

export type FantasyGroup = {
  id: number;
  name: string;
  invite_code: string;
  member_count: number;
  owner_id?: number;
  owner_display_name?: string;
};

export type GroupMember = {
  user_id: number;
  display_name: string;
  joined_at: string;
};

export type FantasyGroupDetail = {
  id: number;
  name: string;
  invite_code: string;
  owner_id: number;
  owner_display_name: string;
  member_count: number;
  members: GroupMember[];
  created_at: string;
  updated_at: string;
};

export type GroupLeaderboardRow = {
  rank: number;
  fantasy_team_id: number;
  name: string;
  owner_id: number;
  owner_display_name: string;
  total_points: number;
};

export type LineupEntry = {
  id: number;
  player: { id: number; display_name: string; position: string };
  team_id: number;
  is_starter: boolean;
  bench_order: number | null;
  subbed_on_minute: number | null;
  subbed_off_minute: number | null;
};

// ─── API Response wrappers ────────────────────────────────────────────────────

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// ─── League API response types ────────────────────────────────────────────────
// Full team object from /api/league/teams/

export type ApiTeam = {
  id: number;
  organization: { id: number; name: string; slug: string };
  name: string;
  slug: string;
  short_name: string;
  logo: string | null;
  competitions: Array<{ id: number; name: string; slug: string; season: string; status: string }>;
  captain: { id: number; display_name: string } | null;
  created_at: string;
  updated_at: string;
};

// Full player object from /api/league/players/
export type ApiPlayer = {
  id: number;
  team: { id: number; name: string; short_name: string; slug: string } | null;
  user_id: number | null;
  first_name: string;
  last_name: string;
  display_name: string;
  shirt_number: number | null;
  position: 'GK' | 'DEF' | 'MID' | 'ATT';
  position_display: string;
  photo: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Fantasy API response types ───────────────────────────────────────────────

export type FantasyTeamFull = {
  id: number;
  name: string;
  competition: { id: number; name: string; slug: string };
  season: {
    id: number;
    name: string;
    slug: string;
    status: string;
    start_date: string;
    end_date: string;
  };
  total_points: number;
  created_at: string;
  updated_at: string;
};

export type SquadEntry = {
  id: number;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    display_name: string;
    position: string;
    shirt_number: number | null;
    team: { id: number; name: string };
  };
  is_starter: boolean;
  is_captain: boolean;
};

export type Squad = {
  starters: SquadEntry[];
  bench: SquadEntry[];
  captain_id: number | null;
};

export type LeaderboardRow = {
  rank: number;
  fantasy_team_id: number;
  name: string;
  owner_id: number;
  owner_display_name: string;
  total_points: number;
};

// ─── WebSocket message types ──────────────────────────────────────────────────

export type WsMatchMessage =
  | { type: 'match_state' }
  | { type: 'match_event' };

export type WsMessage = WsMatchMessage;
