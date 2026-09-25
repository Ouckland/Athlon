# Athlon — API Contract

**Version:** MVP backend (post-Phase 5)
**Audience:** React/PWA frontend developers
**Base URL (dev):** `http://localhost:8000`

Athlon is a football live-scores + fantasy platform. The backend is Django +
Django REST Framework, using **session authentication** and **Django Channels**
for live match updates.

This document is the contract between the Django backend and the React/PWA
frontend. If a behavior is not documented here, do not assume it exists.

---

## 1. Overview

### Domain model

```
Organization
    ↓
Competition        (type: LEAGUE | CUP)
    ↓
Season
    ↓
Stage              (kind: GAMEWEEK | ROUND)
    ↓
Match              (home_team, away_team, status, scores, minute)
    ↓
MatchEvent         (GOAL, YELLOW, RED, SUBSTITUTION, HALFTIME, FULLTIME)
    ↓
FantasyPoints      (server-derived from events + lineups)
    ↓
Leaderboards
```

Fantasy axis (parallel to the match axis):

```
FantasyTeam        (user + competition + season)
    ↓
FantasyPlayerSelection  (per-stage squad: 15 players, 11 starters, 1 captain)
    ↓
FantasyTransfer         (audit log; Wildcard/Free Hit transfers flagged)
    ↓
FantasyChipUse          (one use per chip per season, one chip per gameweek)
```

Team management axis:

```
Team   ←→   TeamManager   (user may manage multiple teams;
                            a team may have multiple managers)
```

### Apps

- `/api/accounts/` — registration, login, email verification, password reset
- `/api/league/` — organizations, competitions, seasons, stages, teams,
  players, team managers, competition participation
- `/api/matches/` — matches, events, lineups
- `/api/fantasy/` — fantasy teams, squads, transfers, chips, points, groups,
  leaderboards
- `/api/public/` — public fixtures / livescore feed

---

## 2. API Conventions

### Base URL

```
<API_BASE_URL>
```

Local dev: `http://localhost:8000`. All endpoints are prefixed with `/api/`.

### Request / response format

- JSON in, JSON out. `Content-Type: application/json` on writes.
- Timestamps: ISO 8601 with timezone, e.g. `2026-09-15T14:30:00Z`.
- Dates: `YYYY-MM-DD`.
- IDs: integers.
- Decimal fields (`price`, `starting_budget`, `squad_value`,
  `remaining_budget`) are serialized as **strings** by DRF. Parse with
  `parseFloat` on the client when doing arithmetic.

### Pagination

**None.** All list endpoints return the full result set.

### Common status codes

| Code | Meaning |
|---|---|
| `200` | Success (read or update) |
| `201` | Resource created |
| `204` | Success, no body |
| `400` | Validation error or domain rule violation |
| `401` | Only from `POST /api/accounts/login/` for invalid credentials |
| `403` | Authenticated but not permitted, OR anonymous on a protected endpoint |
| `404` | Resource not found |
| `405` | Method not allowed (e.g. `PUT` on a squad read endpoint) |
| `4404` | WebSocket close code for "match not found" |

**Note on 401 vs 403.** The backend uses only `SessionAuthentication`, so DRF
renders anonymous `NotAuthenticated` as **`403`** on protected endpoints — not
`401`. Treat `403` on a write endpoint as "either not logged in, or not
permitted".

### Error format

Two shapes:

**Field-keyed serializer errors** (from DRF, on `400`):

```json
{
  "email": ["A user with this email already exists."],
  "password_confirmation": ["Passwords do not match."]
}
```

**Service-layer errors** (`detail` key, on `400`/`403`/`404`):

```json
{ "detail": "Squad must have exactly 15 players." }
```

### Enum values

| Field | Values |
|---|---|
| `User.role` | `USER`, `SCOUT`, `ADMIN` |
| `Competition.type` | `LEAGUE`, `CUP` |
| `Competition.status` | `DRAFT`, `ACTIVE`, `COMPLETED` |
| `Season.status` | `DRAFT`, `ACTIVE`, `COMPLETED` |
| `Stage.kind` | `GAMEWEEK`, `ROUND` |
| `Match.status` | `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`, `POSTPONED`, `CANCELLED` |
| `MatchEvent.type` | `GOAL`, `YELLOW`, `RED`, `SUBSTITUTION`, `HALFTIME`, `FULLTIME` |
| `Player.position` | `GK`, `DEF`, `MID`, `ATT` |
| `FantasyChipUse.chip_type` | `WILDCARD`, `FREE_HIT`, `BENCH_BOOST`, `TRIPLE_CAPTAIN` |

---

## 3. Authentication

**Session authentication only.** No JWT, no bearer tokens, no OAuth.

Django sets:
- `sessionid` — the session cookie
- `csrftoken` — the CSRF cookie

### Cookies and CSRF

Every fetch must include credentials:

```js
fetch(url, { credentials: "include" })
```

Every unsafe method (`POST`, `PUT`, `PATCH`, `DELETE`) must also send the CSRF
token:

```js
const csrf = document.cookie
  .split("; ")
  .find(row => row.startsWith("csrftoken="))
  ?.split("=")[1];

fetch(url, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-CSRFToken": csrf,
  },
  body: JSON.stringify(payload),
});
```

Missing CSRF token on a write → `403`.

### Register

```
POST /api/accounts/register/
Access: Public
```

**Request:**

```json
{
  "email": "ada@example.com",
  "password": "StrongPass!23",
  "password_confirmation": "StrongPass!23",
  "first_name": "Ada",
  "last_name": "Obi",
  "display_name": "ada"
}
```

**Response `201`:** User object. Session cookie set (user is logged in
immediately).

**Errors:** `400` — duplicate email, password mismatch, weak password.

**Side effects:** Sends a verification email.

### Login

```
POST /api/accounts/login/
Access: Public
```

**Request:** `{"email": "ada@example.com", "password": "StrongPass!23"}`

**Response `200`:** User object.

**Errors:**
- `400` — missing email or password.
- `401` — invalid credentials or inactive account.

**Side effects:** Session cookie set.

### Logout

```
POST /api/accounts/logout/
Access: Authenticated
```

**Response `204`.** Session invalidated.

**Errors:** `403` if anonymous.

### Current user

```
GET /api/accounts/me/
Access: Authenticated
```

**Response `200`:** User object.

**User object:**

```json
{
  "id": 1,
  "email": "ada@example.com",
  "first_name": "Ada",
  "last_name": "Obi",
  "display_name": "ada",
  "avatar": null,
  "role": "USER",
  "email_verified": false,
  "created_at": "2026-09-15T12:00:00Z"
}
```

### Verify email

```
GET /api/accounts/verify-email/<token>/
Access: Public
```

**Response `200`:** `{ "detail": "Email verified successfully.", "email_verified": true }`

Already-verified returns `200` with `"Email is already verified."`.

**Errors:** `400` — invalid or expired token; body includes `"reason"`.

### Resend verification

```
POST /api/accounts/resend-verification/
Access: Public
```

**Request:** `{"email": "ada@example.com"}`

**Response `200`:** `{ "detail": "If an account exists for this email and is unverified, a verification email has been sent." }`

Same response whether the email exists or not.

### Forgot password

```
POST /api/accounts/forgot-password/
Access: Public
```

**Request:** `{"email": "ada@example.com"}`

**Response `200`:** `{ "detail": "If an account exists for this email, a password reset link has been sent." }`

### Reset password

```
POST /api/accounts/reset-password/
Access: Public
```

**Request:**

```json
{
  "uid": "<uid from reset email>",
  "token": "<token from reset email>",
  "new_password": "NewStrongPass!23",
  "new_password_confirmation": "NewStrongPass!23"
}
```

**Response `200`:** `{ "detail": "Password has been reset successfully." }`

**Errors:** `400` for invalid/expired token, mismatch, weak password.

---

## 4. Roles and Permissions

Three global roles exist on `User.role`:

| Role | Global permissions |
|---|---|
| `USER` | Fantasy ownership, reading public data, creating orgs/competitions/teams/players. No match or lineup privileges. |
| `SCOUT` | All of `USER`, **plus** creating matches and recording match events. Does **not** automatically get lineup rights. |
| `ADMIN` | Global administrative override: competition participation, team manager assignment, match creation, event recording, lineup override for any team. |

**Team Manager is NOT a global role.** It is a per-team relationship
(`TeamManager`) that grants a user lineup-management rights for that specific
team.

- A user may manage multiple teams.
- A team may have multiple managers.
- A SCOUT does not become a team manager automatically. Only an explicit
  `TeamManager` row grants the permission.

The reusable check is `can_manage_team(user, team)`:

| User | Can manage team? |
|---|---|
| Django superuser | Yes — any team |
| `ADMIN` | Yes — any team |
| Assigned `TeamManager` | Yes — for their teams only |
| `SCOUT` with no `TeamManager` row | No |
| `USER` | No |
| Anonymous | No |

Public/anonymous endpoints: all `GET` reads on league, matches, lineups,
players, teams, organizations, competitions, seasons, stages, public matches.
See §12 for the fixtures/livescore feed.

---

## 5. Organizations

### Organization object

```json
{
  "id": 1,
  "name": "FUNAAB Sports",
  "slug": "funaab-sports",
  "description": "",
  "logo": null,
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

### List / create

```
GET  /api/league/organizations/           Access: Public
POST /api/league/organizations/           Access: Authenticated (any role)
```

**POST request:**

```json
{ "name": "FUNAAB Sports", "description": "Optional" }
```

**POST response `201`:** Organization object. `slug` is generated server-side.

**Errors:** `400` — name empty.

### Retrieve

```
GET /api/league/organizations/<id>/
Access: Public
```

**Response `200`:** Organization object. `404` if unknown.

**No update or delete endpoint.**

---

## 6. Competitions

### Competition object

```json
{
  "id": 1,
  "organization": { "id": 1, "name": "FUNAAB Sports", "slug": "funaab-sports" },
  "name": "2026 Campus League",
  "slug": "2026-campus-league",
  "description": "",
  "type": "LEAGUE",
  "season": "",
  "status": "DRAFT",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30",
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

- `type` — `LEAGUE` (default) or `CUP`.
- `season` — legacy free-text field. Use the structured Season API (§7) for
  real season handling.

### List / create

```
GET  /api/league/competitions/           Access: Public
POST /api/league/competitions/           Access: Authenticated (any role)
```

**GET query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `organization` | int | Filter by organization. |

**POST request:**

```json
{
  "organization_id": 1,
  "name": "2026 Campus League",
  "description": "",
  "type": "LEAGUE",
  "status": "DRAFT",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30"
}
```

**POST response `201`:** Competition object.

**Errors:** `400` — organization missing/invalid, name empty, invalid `type`,
invalid `status`.

### Retrieve

```
GET /api/league/competitions/<id>/
Access: Public
```

**No update endpoint.**

### Competition participation

```
GET    /api/league/competitions/<competition_id>/teams/            Access: Public
POST   /api/league/competitions/<competition_id>/teams/            Access: ADMIN
DELETE /api/league/competitions/<competition_id>/teams/<team_id>/  Access: ADMIN
```

**Team brief (list/add response):**

```json
{ "id": 1, "name": "Computer Science FC", "short_name": "CSFC", "slug": "computer-science-fc" }
```

**POST body:** `{"team_id": 1}`. Response `201`.

**Rules:**
- A team must belong to the **same organization** as the competition.
- Adding an already-participating team is idempotent.
- A team with **matches in the competition cannot be removed** — `400`.

---

## 7. Seasons & Stages

### Season object

```json
{
  "id": 1,
  "competition": { "id": 1, "name": "2026 Campus League", "slug": "2026-campus-league", "season": "", "status": "DRAFT" },
  "name": "2026",
  "slug": "2026",
  "status": "DRAFT",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30",
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

### List / create seasons

```
GET  /api/league/competitions/<competition_id>/seasons/   Access: Public
POST /api/league/competitions/<competition_id>/seasons/   Access: Authenticated
```

**POST request:**

```json
{
  "name": "2026",
  "status": "DRAFT",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30"
}
```

**Errors:** `400` — empty name, invalid status, or `end_date < start_date`.

**Notes:** `slug` generated server-side, unique within the competition.

### Retrieve season

```
GET /api/league/seasons/<id>/
Access: Public
```

### Stage object

```json
{
  "id": 1,
  "season": { "id": 1, "name": "2026", "slug": "2026", "status": "DRAFT" },
  "kind": "GAMEWEEK",
  "number": 1,
  "name": "",
  "start_date": null,
  "end_date": null,
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

- `kind` — `GAMEWEEK` (for `LEAGUE` competitions) or `ROUND` (for `CUP`).

### List / create stages

```
GET  /api/league/seasons/<season_id>/stages/   Access: Public
POST /api/league/seasons/<season_id>/stages/   Access: Authenticated
```

**POST request:**

```json
{ "kind": "GAMEWEEK", "number": 1, "name": "", "start_date": null, "end_date": null }
```

**Errors:** `400` — invalid `kind`, kind mismatches the parent competition's
type, duplicate `number` in the season, or invalid date range.

### Retrieve stage

```
GET /api/league/stages/<id>/
Access: Public
```

---

## 8. Teams

### Team object

```json
{
  "id": 1,
  "organization": { "id": 1, "name": "FUNAAB Sports", "slug": "funaab-sports" },
  "name": "Computer Science FC",
  "slug": "computer-science-fc",
  "short_name": "CSFC",
  "logo": null,
  "competitions": [
    { "id": 1, "name": "2026 Campus League", "slug": "2026-campus-league", "season": "", "status": "DRAFT" }
  ],
  "captain": { "id": 10, "display_name": "John Doe" },
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

### List teams

```
GET /api/league/teams/
Access: Public
```

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `organization` | int | Filter by organization. |
| `competition` | int | Filter to teams participating in this competition. |

### Create team

```
POST /api/league/teams/
Access: Authenticated (any role)
```

**Request:**

```json
{
  "organization_id": 1,
  "name": "Computer Science FC",
  "short_name": "CSFC",
  "competition_ids": [1],
  "captain_id": null
}
```

**Errors:** `400` — a `competition_ids[i]` from a different organization;
captain not a player on the team.

### Retrieve team

```
GET /api/league/teams/<id>/
Access: Public
```

---

## 9. Team Managers

A `TeamManager` row grants a user lineup-management rights for a specific team.

### TeamManager object

```json
{
  "user_id": 5,
  "display_name": "Ada Obi",
  "created_at": "2026-09-15T12:00:00Z"
}
```

No email is exposed.

### List managers

```
GET /api/league/teams/<team_id>/managers/
Access: Public
```

### Assign manager

```
POST /api/league/teams/<team_id>/managers/
Access: ADMIN
```

**Request:** `{"user_id": 5}`. Response `201`. Idempotent.

### Remove manager

```
DELETE /api/league/teams/<team_id>/managers/<user_id>/
Access: ADMIN
```

**Response `204`.**

---

## 10. Players

### Player object

```json
{
  "id": 10,
  "team": { "id": 1, "name": "Computer Science FC", "short_name": "CSFC", "slug": "computer-science-fc" },
  "user_id": null,
  "first_name": "John",
  "last_name": "Doe",
  "display_name": "John Doe",
  "shirt_number": 9,
  "position": "ATT",
  "position_display": "Attacker",
  "photo": null,
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

A player can exist without an Athlon account (`user_id` is optional).

**Fantasy price.** When a player is returned from a fantasy endpoint, the
serializer adds a `price` field (string decimal or `null`):

```json
{
  "id": 10,
  "first_name": "John",
  "last_name": "Doe",
  "display_name": "John Doe",
  "position": "ATT",
  "shirt_number": 9,
  "team": { "id": 1, "name": "Computer Science FC" },
  "price": "9.5"
}
```

The MVP uses **one global fantasy price per player**, not per-competition.

### List players

```
GET /api/league/players/
Access: Public
```

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `team` | int | Filter by team. |

### Create player

```
POST /api/league/players/
Access: Authenticated (any role)
```

**Request:**

```json
{
  "team_id": 1,
  "first_name": "John",
  "last_name": "Doe",
  "display_name": "John Doe",
  "shirt_number": 9,
  "position": "ATT",
  "user_id": null
}
```

**Errors:** `400` — shirt number out of range (1–99) or duplicated within the
team; invalid position.

### Retrieve player

```
GET /api/league/players/<id>/
Access: Public
```

---

## 11. Matches / Fixtures

### Match object

```json
{
  "id": 42,
  "competition": { "id": 1, "name": "2026 Campus League", "slug": "2026-campus-league" },
  "home_team": { "id": 1, "name": "Computer Science FC", "short_name": "CSFC" },
  "away_team": { "id": 2, "name": "Engineering FC", "short_name": "ENG" },
  "stage": { "id": 1, "kind": "GAMEWEEK", "kind_display": "Gameweek", "number": 1, "name": "" },
  "status": "LIVE",
  "status_display": "Live",
  "kickoff_at": "2026-09-20T15:00:00Z",
  "started_at": "2026-09-20T15:01:00Z",
  "finished_at": null,
  "home_score": 2,
  "away_score": 1,
  "minute": 67,
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-20T15:47:00Z"
}
```

`stage` may be `null` for matches created without a stage.

### List matches

```
GET /api/matches/
Access: Public
```

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `competition` | int | Filter by competition. |
| `team` | int | Matches where team is home OR away. |
| `status` | string | Literal `Match.status` value. |

### Create match

```
POST /api/matches/
Access: SCOUT or ADMIN
```

**Request:**

```json
{
  "competition_id": 1,
  "home_team_id": 1,
  "away_team_id": 2,
  "stage_id": 1,
  "kickoff_at": "2026-09-20T15:00:00Z"
}
```

`stage_id` and `kickoff_at` are optional.

**Response `201`:** Match object.

**Errors:**
- `400` — home == away, teams not in the competition, teams from a different
  organization, or `stage` doesn't belong to the competition.
- `403` — not SCOUT/ADMIN.

### Retrieve match

```
GET /api/matches/<id>/
Access: Public
```

**No match update endpoint.**

### Match status behavior

Match status is derived from events recorded on the match. The MVP has no
external provider:

| Event | Effect |
|---|---|
| First in-play event on a `SCHEDULED` match | `status → LIVE`, `started_at` set |
| Any event | `Match.minute` set to the event's minute |
| `HALFTIME` event | `status → HALFTIME` |
| `FULLTIME` event | `status → FINISHED`, `finished_at` set |
| Any `GOAL` | `home_score` / `away_score` recomputed from all `GOAL` events |

Once a match reaches `FINISHED`, `POSTPONED`, or `CANCELLED`, further events
are rejected with `400`.

---

## 12. Public Fixtures

### Public match object

```json
{
  "id": 42,
  "competition": { "id": 3, "name": "Premier League", "type": "LEAGUE" },
  "stage": { "id": 8, "kind": "GAMEWEEK", "kind_display": "Gameweek", "number": 5, "name": "Gameweek 5" },
  "home_team": { "id": 10, "name": "Eagles FC", "short_name": "EAG", "logo": null },
  "away_team": { "id": 11, "name": "Lions FC", "short_name": "LIO", "logo": null },
  "kickoff_at": "2026-09-15T18:00:00Z",
  "status": "LIVE",
  "minute": 67,
  "home_score": 2,
  "away_score": 1
}
```

### List public matches

```
GET /api/public/matches/
Access: Public
```

**Query parameters (all optional, all composable with AND):**

| Parameter | Type | Values | Description |
|---|---|---|---|
| `date` | string | `today` \| `tomorrow` \| `week` | Local-calendar filter on kickoff. |
| `status` | string | `LIVE` or any `Match.status` | Status filter. |
| `competition` | int | competition ID | Filter by competition. |
| `organization` | int | organization ID | Filter via the competition's organization. |

**Semantics:**

- `date=today` — matches whose `kickoff_at` is today in the server timezone.
  Includes `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`. **Excludes**
  `POSTPONED` and `CANCELLED`.
- `date=tomorrow` — same rules, tomorrow.
- `date=week` — today through today + 6 days, inclusive (7 calendar days).
  End boundary exclusive. Same status exclusions.
- `status=LIVE` — matches with `status` in (`LIVE`, `HALFTIME`), regardless of
  kickoff date. A live match whose kickoff was yesterday still appears here.
- `competition=<id>` — integer; non-integer → `400`, unknown → `404`.
- `organization=<id>` — same validation.

**Response envelope:**

```json
{
  "count": 3,
  "results": [ /* Public match objects */ ]
}
```

**Ordering:** `kickoff_at` ascending (nulls last), then `id` ascending.

**Errors:**

| Condition | Status |
|---|---|
| Unknown `date` value | `400` |
| Unknown `status` value | `400` |
| Non-integer `competition`/`organization` | `400` |
| Nonexistent `competition`/`organization` | `404` |

---

## 13. Live Match State

The canonical way for the frontend to display a live match is:

1. `GET /api/public/matches/?status=LIVE` returns all live/halftime matches.
2. For each match the UI wants updates on, open a WebSocket to
   `/ws/matches/<match_id>/` (§24).

There is no dedicated `/api/matches/live/` endpoint; use the `status=LIVE`
filter.

---

## 14. Match Events

### Event object

```json
{
  "id": 1001,
  "type": "GOAL",
  "type_display": "Goal",
  "minute": 23,
  "team": { "id": 1, "name": "Computer Science FC", "short_name": "CSFC" },
  "player": { "id": 10, "display_name": "John Doe", "position": "ATT" },
  "related_player": null,
  "description": "",
  "created_at": "2026-09-20T15:24:11Z"
}
```

### List events

```
GET /api/matches/<match_id>/events/
Access: Public
```

Ordered by `(minute, created_at)`.

### Record event

```
POST /api/matches/<match_id>/events/
Access: SCOUT or ADMIN
```

**Request:**

```json
{
  "type": "GOAL",
  "minute": 23,
  "team_id": 1,
  "player_id": 10,
  "related_player_id": null,
  "description": ""
}
```

**Field requirements by type:**

| Type | `team_id` | `player_id` | `related_player_id` |
|---|---|---|---|
| `GOAL` | required | optional | optional (assister) |
| `YELLOW` | required | optional | must be `null` |
| `RED` | required | optional | must be `null` |
| `SUBSTITUTION` | required | required (going off) | required (coming on) |
| `HALFTIME` | optional | must be `null` | must be `null` |
| `FULLTIME` | optional | must be `null` | must be `null` |

**`related_player_id` semantics:**

- On `GOAL`: the assister (must be on the scoring team, cannot be the scorer).
- On `SUBSTITUTION`: the player coming **on** (must be on the team's
  submitted bench).
- Other types: must be `null`.

**Response `201`:**

```json
{
  "event": { /* event object */ },
  "match": { /* updated Match object */ }
}
```

**Errors:**

- `400` — invalid type, minute out of range (1–200), team not part of match,
  player not on event team, substitution rule violation, `related_player`
  misuse, match in a terminal status, duplicate `HALFTIME` or `FULLTIME`,
  `FULLTIME` before `HALFTIME`, or substitution player not in the submitted
  lineup.
- `403` — not SCOUT/ADMIN.
- `404` — match not found.

**Side effects** (server-side, no client action required):

- `Match.home_score` / `away_score` recomputed from all `GOAL` events.
- `Match.status` transitions per §11.
- `Match.minute` updated.
- `Match.started_at` / `finished_at` populated when applicable.
- On `SUBSTITUTION`, `MatchLineup` rows for outgoing and incoming players
  are updated.
- On `FULLTIME`, active lineup entries are closed at the fulltime minute.
- `FantasyPoints` for the match recalculated.
- A WebSocket broadcast is sent to connected clients (§24).

---

## 15. Match Lineups

### Lineup entry object

```json
{
  "id": 1,
  "player": { "id": 10, "display_name": "John Doe", "position": "ATT" },
  "team_id": 1,
  "is_starter": true,
  "bench_order": null,
  "subbed_on_minute": null,
  "subbed_off_minute": null
}
```

### Read lineup

```
GET /api/matches/<match_id>/lineups/<team_id>/
Access: Public
```

**Response `200`:** Array of LineupEntry objects, ordered by `-is_starter`,
then `bench_order`, then player last name.

### Submit lineup

```
PUT /api/matches/<match_id>/lineups/<team_id>/
Access: Authenticated + can_manage_team(user, team)
```

**Who can submit a lineup:**

- `ADMIN` or Django superuser — any team.
- Assigned `TeamManager` for that team — allowed.
- `SCOUT` without a `TeamManager` relationship — `403`.
- `USER` — `403`.
- Anonymous — `403`.

**Request:**

```json
{
  "team_id": 1,
  "starters": [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  "bench": [21, 22, 23, 24]
}
```

**Validation:**

- `team_id` in body must match the URL.
- All player IDs must exist.
- Exactly **11** starters.
- **0–4** bench players.
- No duplicate players.
- No starter/bench overlap.
- All players must belong to `team`.
- `team` must be home or away in the match.
- `team` must be a participating team in the match's competition.
- Match must be `SCHEDULED`.

**Response `200`:** Updated array of LineupEntry objects.

**Errors:**
- `400` — any validation failure. Body: `{"detail": "..."}`.
- `403` — user is not authorized for this team, or anonymous.
- `404` — match or team not found.

**Atomicity:** Validation runs before any state change. A failed request
never modifies an existing lineup.

**Locking:** Once the match leaves `SCHEDULED`, submission is rejected with
`400`. No override.

---

## 16. Fantasy Teams

A fantasy team belongs to **one user**, **one competition**, and **one
season**. A user may have multiple fantasy teams — one per
`(competition, season)`.

### Fantasy team object

```json
{
  "id": 1,
  "name": "My Team",
  "competition": { "id": 3, "name": "Premier League", "slug": "premier-league" },
  "season": { "id": 1, "name": "2026", "slug": "2026", "status": "DRAFT", "start_date": "2026-03-01", "end_date": "2026-06-30" },
  "starting_budget": "100.0",
  "total_points": 48,
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

### List my teams

```
GET /api/fantasy/teams/
Access: Authenticated
```

**Response `200`:** Array of FantasyTeam objects.

### Create team

```
POST /api/fantasy/teams/
Access: Authenticated
```

**Request:**

```json
{ "name": "My Team", "competition_id": 3, "season_id": 1 }
```

**Response `201`:** FantasyTeam object with `starting_budget` = `"100.0"`.

**Errors:**
- `400` — user already has a fantasy team for this competition/season, or
  season doesn't belong to competition.
- `404` — `competition_id` or `season_id` missing.

### Retrieve team

```
GET /api/fantasy/teams/<team_id>/
Access: Authenticated + must own the team
```

### Update team

```
PATCH /api/fantasy/teams/<team_id>/
Access: Authenticated + must own the team
```

**Request:** `{"name": "New Name"}`

Only `name` is editable.

---

## 17. Starting Squads

A squad is scoped to a **stage** (gameweek). A new gameweek requires a new
starting squad.

**There is no full-squad PUT endpoint.** Replacing a squad wholesale is not
allowed. To change a squad after the starting squad exists, use transfers
(§19).

### Create starting squad

```
POST /api/fantasy/teams/<team_id>/starting-squads/<stage_id>/
Access: Authenticated + must own the team
```

**Request:**

```json
{
  "selections": [
    { "player_id": 10, "is_starter": true,  "is_captain": true  },
    { "player_id": 11, "is_starter": true,  "is_captain": false },
    { "player_id": 12, "is_starter": false, "is_captain": false }
  ]
}
```

Fifteen selections total.

**Response `201`:** Squad response (see §18).

**Errors:**
- `400` — any of the rules below; or if a starting squad already exists for
  this `(fantasy_team, stage)`; or if a chip is already active for this stage.
- `403` — anonymous.
- `404` — team or stage unknown, or not the team owner.

**Rules:**

- Exactly **15** players.
- Exactly **2** GK, **5** DEF, **5** MID, **3** ATT.
- Exactly **11** starters.
- Exactly **4** bench.
- Exactly **1** captain. Captain must be a starter.
- No duplicate players.
- Every selected player's team participates in this fantasy team's
  competition.
- Total squad cost ≤ `starting_budget`.
- Every selected player has a fantasy price.
- Stage must be `kind == GAMEWEEK`, same season, same competition.
- Stage must not be locked.

**Does not consume a transfer.**

**Can only be called once per `(fantasy_team, stage)`.**

### Read squad

```
GET /api/fantasy/teams/<team_id>/squads/<stage_id>/
Access: Authenticated + must own the team
```

**Response `200`:**

```json
{
  "stage": { "id": 5, "kind": "GAMEWEEK", "kind_display": "Gameweek", "number": 5, "name": "" },
  "locked": false,
  "active_chip": null,
  "starters": [
    {
      "id": 99,
      "player": {
        "id": 10,
        "first_name": "John",
        "last_name": "Doe",
        "display_name": "John Doe",
        "position": "ATT",
        "shirt_number": 9,
        "team": { "id": 1, "name": "Computer Science FC" },
        "price": "9.5"
      },
      "is_starter": true,
      "is_captain": true
    }
  ],
  "bench": [ /* 4 more */ ],
  "captain_id": 10,
  "squad_value": "98.5",
  "remaining_budget": "1.5",
  "transfers_used": 0,
  "transfers_remaining": 1,
  "transfer_limit": 1
}
```

**Squad state — Free Hit.** When a Free Hit is active for a stage, this
endpoint returns the temporary Free Hit squad (`active_chip: "FREE_HIT"`).
Once the gameweek is fully finished, the endpoint returns the permanent
squad again. Historical scoring for the Free Hit gameweek continues to use
the Free Hit squad (§21).

**Errors:** `400` — ROUND stage, wrong season/competition; `404` — team or
stage missing.

**`PUT /api/fantasy/teams/<team_id>/squads/<stage_id>/` is no longer
available.** It returns `405`.

---

## 18. Transfers

```
POST /api/fantasy/teams/<team_id>/transfers/
Access: Authenticated + must own the team
```

**Request:**

```json
{
  "stage_id": 2,
  "player_out_id": 15,
  "player_in_id": 42
}
```

**Response `201`:**

```json
{
  "transfer": {
    "id": 10,
    "stage_id": 2,
    "player_out": { "id": 15, "display_name": "...", "position": "MID" },
    "player_in":  { "id": 42, "display_name": "...", "position": "MID" },
    "created_at": "2026-09-15T12:00:00Z"
  },
  "squad": { /* full squad response — see §17 */ },
  "transfers_used": 1,
  "transfers_remaining": 0
}
```

**Rules:**

- A starting squad must already exist for the stage.
- Stage must be `GAMEWEEK`, same season, same competition.
- Gameweek must not be locked.
- Outgoing player must be in the current squad for the stage.
- Incoming player must not already be in the squad.
- Incoming player must have a fantasy price.
- Incoming player must be eligible (their team participates in the fantasy
  team's competition).
- Resulting squad must pass the standard composition and budget checks.
- Captain cannot be transferred out (change the captain first).
- Incoming player inherits the outgoing player's starter/bench status.

**Transfer limit:**

- One normal transfer per `(fantasy_team, stage)`.
- A Wildcard active for the stage removes the normal limit for that stage.
- A Free Hit active for the stage removes the normal limit for the stage
  (and edits the temporary Free Hit squad, not the permanent squad).

**Accounting.** Every transfer is recorded in `FantasyTransfer`.
Transfers made while a chip (Wildcard or Free Hit) is active are flagged
`counts_toward_limit=False` and are excluded from `transfers_used` /
`transfers_remaining`. The full history is preserved.

**Historical integrity.** Transfers for one stage never modify selections
for another stage.

**Atomicity.** Validation runs before any DB write. A failed transfer
leaves the squad and the transfer count unchanged.

---

## 19. Fantasy Points

```
GET /api/fantasy/teams/<team_id>/points/?stage=<stage_id>
Access: Authenticated + must own the team
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stage` | int | yes | Stage ID. |

**Response `200`:**

```json
{
  "stage": { "id": 5, "kind": "GAMEWEEK", "kind_display": "Gameweek", "number": 5, "name": "" },
  "active_chip": null,
  "total_points": 42,
  "starting_xi_points": 42,
  "bench_points": 8,
  "players": [
    {
      "player": {
        "id": 10,
        "first_name": "John",
        "last_name": "Doe",
        "display_name": "John Doe",
        "position": "ATT",
        "shirt_number": 9,
        "team": { "id": 1, "name": "Computer Science FC" },
        "price": "9.5"
      },
      "is_starter": true,
      "is_captain": true,
      "base_points": 8,
      "multiplier": 2,
      "points": 16
    }
  ]
}
```

**Field semantics:**

- `base_points` — the player's raw scoring points for this stage (from
  match events + lineups).
- `multiplier` — `1` normally; `2` for the captain; `3` for the captain
  when `TRIPLE_CAPTAIN` is active for this stage.
- `points` — `base_points × multiplier`.
- `starting_xi_points` — sum of `points` for starters only.
- `bench_points` — sum of `base_points` for bench players (informational).
- `total_points` — equals `starting_xi_points` normally; equals
  `starting_xi_points + bench_points` when `BENCH_BOOST` is active.

**Historical behavior.** For a stage where a Free Hit was used, the response
is computed from the Free Hit squad permanently, even after the gameweek
finishes. This makes historical points deterministic.

**Errors:**

| Condition | Status |
|---|---|
| Anonymous | `403` |
| Not the team owner | `404` |
| Missing `stage` param | `400` |
| Non-integer `stage` | `400` |
| Unknown stage ID | `404` |
| ROUND stage | `400` |
| Wrong season/competition | `400` |

---

## 20. Fantasy Chips

Four chips exist: `WILDCARD`, `FREE_HIT`, `BENCH_BOOST`, `TRIPLE_CAPTAIN`.

Each chip can be used **once per season per fantasy team**. Only one chip
can be active per gameweek.

### Read chip state

```
GET /api/fantasy/teams/<team_id>/chips/
Access: Authenticated + must own the team
```

**Response `200`:**

```json
{
  "chips": [
    { "chip": "WILDCARD",       "used": true,  "stage_id": 3 },
    { "chip": "FREE_HIT",       "used": false, "stage_id": null },
    { "chip": "BENCH_BOOST",    "used": false, "stage_id": null },
    { "chip": "TRIPLE_CAPTAIN", "used": false, "stage_id": null }
  ]
}
```

### Activate chip

```
POST /api/fantasy/teams/<team_id>/chips/
Access: Authenticated + must own the team
```

**Request (non-Free-Hit chips):**

```json
{ "stage_id": 5, "chip": "WILDCARD" }
```

**Request (Free Hit — requires inline temporary squad):**

```json
{
  "stage_id": 5,
  "chip": "FREE_HIT",
  "selections": [
    { "player_id": 10, "is_starter": true,  "is_captain": true  },
    { "player_id": 11, "is_starter": true,  "is_captain": false }
  ]
}
```

**Response `201`:** The same shape as `GET /api/fantasy/teams/<team_id>/chips/`.

**Validation:**

1. Authenticated + team owner.
2. Valid chip name.
3. Stage is `GAMEWEEK`, same season, same competition.
4. Stage not locked.
5. Chip has not been used this season by this team.
6. No other chip already active for this stage.
7. For Free Hit: an existing permanent starting squad must exist for this
   stage.
8. For Free Hit: the provided `selections` must pass the standard squad
   validation (composition, budget, captain, prices, eligibility).

**Errors:** `400` for any rule violation.

### Chip behavior

**WILDCARD**

- Removes the normal one-transfer limit for the activated gameweek.
- Transfers made while active are recorded with `counts_toward_limit=False`.
- Permanent squad is modified.
- Still respects: composition, budget, prices, eligibility, captain rule,
  gameweek lock.

**FREE_HIT**

- Requires an existing permanent starting squad.
- Requires an inline 15-player temporary squad in the activation request.
- Writes `FantasyPlayerSelection` rows with `is_free_hit=True`.
- The permanent squad rows are left untouched.
- `GET /squads/<stage>/` returns the Free Hit squad while the gameweek is
  unfinished; after every match in the stage is `FINISHED`, it reverts to
  the permanent squad.
- `GET /points/?stage=<id>` always uses the Free Hit squad for that stage,
  even after the gameweek finishes — historical points are permanent.
- Transfers while Free Hit is active modify the Free Hit squad and are
  unlimited (still respecting composition, budget, captain, eligibility).
- Transfers made under Free Hit are recorded with `counts_toward_limit=False`.

**BENCH_BOOST**

- Affects team-level point aggregation only.
- While active, `total_points = starting_xi_points + bench_points`.
- Underlying player points are unchanged.

**TRIPLE_CAPTAIN**

- While active, the captain's `multiplier` is `3` instead of `2` in
  `GET /points/`.
- Underlying `FantasyPoints` are unchanged.

---

## 21. Leaderboards

### Global leaderboard

```
GET /api/fantasy/leaderboard/
Access: Authenticated
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `competition` | int | yes | Competition ID. |
| `season` | int | yes | Season ID. |
| `stage` | int | no | If present, scope to this stage; else season-wide. |

**Response `200`:**

```json
{
  "rows": [
    {
      "rank": 1,
      "fantasy_team_id": 5,
      "name": "Alpha",
      "owner_id": 3,
      "owner_display_name": "Ada Obi",
      "total_points": 48
    }
  ]
}
```

**Errors:**
- `400` — `competition` or `season` missing.
- `404` — either ID invalid.

Rows are sorted by `total_points` descending. Captain multiplier is already
applied. No email is exposed.

### Group leaderboard

```
GET /api/fantasy/groups/<group_id>/leaderboard/
Access: Authenticated + must be a member
```

**Query parameters:** Same as the global leaderboard.

**Response `200`:** `{ "group_id": 3, "rows": [ /* same row shape */ ] }`

**Errors:** `403` if not a member, `404` if the group doesn't exist.

### Leaderboard scope

Leaderboards are recomputed on every request. They are **not** cached.

---

## 22. Fantasy Groups

Groups are private, invite-code-based, and global (not scoped to a
competition/season). A user may belong to multiple groups.

### Fantasy group object

```json
{
  "id": 3,
  "name": "Fam",
  "invite_code": "AB12CD34",
  "owner_id": 1,
  "owner_display_name": "Ada",
  "member_count": 2,
  "members": [
    { "user_id": 1, "display_name": "Ada", "joined_at": "2026-09-15T12:00:00Z" },
    { "user_id": 2, "display_name": "Bob", "joined_at": "2026-09-15T12:05:00Z" }
  ],
  "created_at": "2026-09-15T12:00:00Z",
  "updated_at": "2026-09-15T12:00:00Z"
}
```

No email is exposed anywhere in the group response.

### List / create groups

```
GET  /api/fantasy/groups/   Access: Authenticated
POST /api/fantasy/groups/   Access: Authenticated
```

**POST request:** `{"name": "Fam"}`

**POST response `201`:** Fantasy group object. Creator is automatically
added as a member.

**Errors:** `400` — empty name.

### Join group

```
POST /api/fantasy/groups/join/
Access: Authenticated
```

**Request:** `{"invite_code": "AB12CD34"}`

**Response `201`:** Fantasy group object.

**Errors:** `400` — invalid code, or already a member.

### Group detail

```
GET /api/fantasy/groups/<group_id>/
Access: Authenticated + must be a member
```

**Errors:** `403` — not a member; `404` — group not found.

### Leave group

```
POST /api/fantasy/groups/<group_id>/leave/
Access: Authenticated + must be a non-owner member
```

**Response `204`.**

**Errors:** `400` — the caller is the owner, or not a member.

### Remove member

```
POST /api/fantasy/groups/<group_id>/members/<user_id>/remove/
Access: Authenticated + must be the group owner
```

**Response `204`.**

**Errors:** `400` — not the owner, attempting to remove self, or target not
a member.

**No invitations, no ownership transfer, no invite-code rotation.**

---

## 23. Fantasy Scoring

**Fantasy points are calculated entirely by the backend.** The frontend must
display backend values and must not independently recompute them.

### Scoring rules

| Rule | Points |
|---|---|
| Appearance (any minutes) | +1 |
| 60+ minutes | +1 |
| Goalkeeper goal | +10 |
| Defender goal | +6 |
| Midfielder goal | +5 |
| Attacker goal | +4 |
| Assist | +3 |
| Clean sheet (GK/DEF only) | +4 |
| Yellow card | −1 |
| Red card | −3 |

Captain multiplier and chip multipliers are applied at the **fantasy-team
aggregation layer**, not in `FantasyPoints`. See §19.

### Minutes

Minutes come from the submitted `MatchLineup`:

- Starter playing the whole match → minutes = final match minute.
- Starter subbed off at minute N → N minutes.
- Bench player subbed on at N, off at M → (M − N) minutes.
- Bench player never used → 0 minutes.
- No lineup submitted → 0 minutes.

The 60+ bonus applies at exactly 60 minutes or more.

### Clean sheets

Awarded to GK or DEF only when:
- The player played ≥ 60 minutes.
- The player did not receive a red card.
- The opponent scored 0 goals.

### Assists

Represented via `related_player_id` on a `GOAL` event. Assists require the
Scout to record them.

### Determinism

Points are recomputed from match events. If a match event is corrected or
removed, points for that match are recalculated automatically.

---

## 24. WebSocket Contract

### Connection

```
ws://<host>/ws/matches/<match_id>/
```

(Use `wss://` behind TLS.)

**Authentication:** None. Public.

### On connect

1. Server verifies the match exists. If not, closes with code `4404`.
2. Server sends one `match_state` message.

### Message: `match_state`

```json
{
  "type": "match_state",
  "match": { /* Match object — see §11 */ },
  "events": [ /* Event objects — see §14, ordered by (minute, created_at) */ ]
}
```

### Message: `match_event`

Sent every time an event is successfully recorded on the match:

```json
{
  "type": "match_event",
  "event": { /* Event object */ },
  "match": { /* updated Match object with new score/status/minute */ }
}
```

### Client → server

**No messages are accepted.** The WebSocket is read-only.

### Broadcast guarantees

- Broadcasts fire only after the underlying DB transaction commits. A
  rolled-back event does not produce a message.
- Fantasy points for the match are recalculated before the broadcast. When
  a client receives `match_event`, fantasy scoring for that event has
  already completed.
- Fantasy points are **not** included in the WebSocket payload.

### Recommended frontend lifecycle

1. Fetch live matches via `GET /api/public/matches/?status=LIVE`.
2. Open a WebSocket per match that needs live updates.
3. On `match_state`, replace local state for the match.
4. On `match_event`, update the match and append the event.
5. Close the socket when the match leaves the live view or the component
   unmounts.

---

## 25. Error Format

Two error shapes are used consistently across the API:

**Serializer validation errors** (`400`), keyed by field:

```json
{
  "email": ["A user with this email already exists."],
  "password_confirmation": ["Passwords do not match."]
}
```

**Service / domain errors** (`400`, `403`, `404`), single key:

```json
{ "detail": "Squad must have exactly 15 players." }
```

Common status codes:

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `204` | Success, no body |
| `400` | Validation error or domain rule violation |
| `401` | Invalid credentials (`login` only) |
| `403` | Authenticated but not permitted; or anonymous on a protected write |
| `404` | Resource not found |
| `405` | Method not allowed |

---

## 26. CSRF / Session Authentication

Athlon uses Django's standard session authentication.

### Cookies

- `sessionid` — set on successful login/registration.
- `csrftoken` — set by Django's CSRF middleware.

Both cookies are `HttpOnly=false` for `csrftoken` (readable by JS) and
`HttpOnly=true` for `sessionid`.

### Requirements for write requests

Every `POST`, `PUT`, `PATCH`, `DELETE` must include:

```
Cookie: sessionid=<session>
Cookie: csrftoken=<csrf>
X-CSRFToken: <csrf>
```

The `X-CSRFToken` value must equal the `csrftoken` cookie.

### Fetch example

```js
const csrf = document.cookie
  .split("; ")
  .find(row => row.startsWith("csrftoken="))
  ?.split("=")[1];

await fetch("<API_BASE_URL>/api/fantasy/teams/", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-CSRFToken": csrf,
  },
  body: JSON.stringify({ name: "My Team", competition_id: 1, season_id: 1 }),
});
```

A missing or mismatched `X-CSRFToken` on a write returns `403`.

### CORS

The frontend origin must be in `CORS_ALLOWED_ORIGINS` and
`CORS_ALLOW_CREDENTIALS` must be `True`.

---

## 27. Development / Demo Seed

A management command is available for local development and the frontend
preview:

```bash
python manage.py seed_demo             # create demo data (no-op if it exists)
python manage.py seed_demo --reset     # wipe demo data and recreate it
```

**What it creates** (deterministic and repeatable):

- 1 organization: `FUNAAB Sports` (slug `funaab-sports-demo`)
- 1 competition: `FUNAAB Football League` (type `LEAGUE`)
- 1 season: `2026 Season`
- 4 gameweeks (GW1–GW4, all `kind=GAMEWEEK`)
- 6 teams, 90 players (15 per team: 2 GK / 5 DEF / 5 MID / 3 ATT),
  each player with a fantasy price
- 12 matches across the four gameweeks:
  - GW1: 3 × `FINISHED`
  - GW2: 3 × `FINISHED`
  - GW3: 1 × `LIVE`, 1 × `HALFTIME`, 1 × `SCHEDULED`
  - GW4: 3 × `SCHEDULED` (future kickoffs)
- Lineups for every played/live match, and events (goals with assists,
  yellow cards, substitutions, halftime, fulltime)
- 6 users:
  - `admin@demo.athlon.local` — role `ADMIN`
  - `scout@demo.athlon.local` — role `SCOUT`
  - `user1@demo.athlon.local` through `user5@demo.athlon.local` — role `USER`
- 5 `TeamManager` rows (user1–user5 as managers of teams 1–5)
- 5 `FantasyTeam` rows with valid squads across all four gameweeks
- Chip uses demonstrating all four chips:
  - user4: `BENCH_BOOST` (GW1, finished)
  - user5: `TRIPLE_CAPTAIN` (GW1, finished)
  - user3: `FREE_HIT` (GW3, current — both permanent and FH squads exist)
  - user2: `WILDCARD` (GW4, upcoming)
- One normal transfer and one Wildcard transfer (accounting is correct)
- `FantasyPoints` generated via the real match-event pipeline

**Demo credentials.** All demo users share the development password
`DemoPassword!2026`. These are **development-only credentials**. Never use
them anywhere except a local/dev instance.

**Reset behavior.** `--reset` deletes only data created by this command,
identified by the organization slug `funaab-sports-demo` and the email
domain `demo.athlon.local`. It does not touch arbitrary development data.

---

## Contract Changes

If the backend changes a response or behavior:

1. Update this document.
2. Notify the frontend developer.
3. Update the frontend.
4. Test the affected flow.

Do not silently change API fields.