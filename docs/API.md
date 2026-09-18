# Athlon API Contract

**Version:** MVP backend
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

A parallel, independent axis:

```
FantasyTeam        (user + competition + season)
    ↓
FantasyPlayerSelection  (per-stage squad: 15 players, 11 starters, 1 captain)
```

And team management:

```
Team   ←→   TeamManager   (user may manage multiple teams; a team may have
                            multiple managers)
```

### Apps

- `/api/accounts/` — registration, login, email verification, password reset
- `/api/league/` — organizations, competitions, seasons, stages, teams, players
- `/api/matches/` — matches, events, lineups
- `/api/fantasy/` — fantasy teams, squads, groups, leaderboards
- `/api/public/` — public fixtures / livescore feed

---

## 2. API Conventions

### Base URL

```
<API_BASE_URL>
```

Local dev: `http://localhost:8000`. All endpoints are prefixed with `/api/`.

### Authentication

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

Missing CSRF token → `403`.

### Request / response format

- JSON in, JSON out. `Content-Type: application/json` on writes.
- Timestamps: ISO 8601 with timezone, e.g. `2026-09-15T14:30:00Z`.
- Dates: `YYYY-MM-DD`.
- IDs: integers.

### Pagination

**None.** All list endpoints return the full result set. If a list grows large
enough to need pagination, that will be added in a future backend change and
this contract will be updated.

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
| `4404` | WebSocket close code for "match not found" |

**Note on 401 vs 403.** The backend uses only `SessionAuthentication`, so DRF
renders anonymous `NotAuthenticated` as **`403`** on protected endpoints — not
`401`. Treat `403` on a write endpoint as "either not logged in, or not
permitted". Only `login` returns an explicit `401`.

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

---

## 3. Authentication

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

**Response `201`:**

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

**Errors:** `400` — duplicate email, password mismatch, weak password.

**Side effects:** Sends a verification email. Session cookie set (user is
logged in immediately).

### Login

```
POST /api/accounts/login/
Access: Public
```

**Request:** `{"email": "ada@example.com", "password": "StrongPass!23"}`

**Response `200`:** User object (same shape as register).

**Errors:**
- `400` — missing email or password.
- `401` — invalid credentials or inactive account.

**Side effects:** Session cookie set.

### Logout

```
POST /api/accounts/logout/
Access: Authenticated
```

**Response `204`** — empty body. Session invalidated.

**Errors:** `403` if anonymous.

### Current user

```
GET /api/accounts/me/
Access: Authenticated
```

**Response `200`:** User object.

**Errors:** `403` if anonymous.

### Verify email

```
GET /api/accounts/verify-email/<token>/
Access: Public
```

**Response `200`:**

```json
{ "detail": "Email verified successfully.", "email_verified": true }
```

Already-verified returns `200` with `"Email is already verified."`

**Errors:** `400` — invalid or expired token. Body includes `"reason": "invalid" | "expired"`.

### Resend verification

```
POST /api/accounts/resend-verification/
Access: Public
```

**Request:** `{"email": "ada@example.com"}`

**Response `200`:**

```json
{ "detail": "If an account exists for this email and is unverified, a verification email has been sent." }
```

The response is identical whether the email exists or not (anti-enumeration).

### Forgot password

```
POST /api/accounts/forgot-password/
Access: Public
```

**Request:** `{"email": "ada@example.com"}`

**Response `200`:**

```json
{ "detail": "If an account exists for this email, a password reset link has been sent." }
```

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

**Response `200`:** `{"detail": "Password has been reset successfully."}`

**Errors:** `400` for invalid/expired token, mismatch, weak password.

---

## 4. Organizations

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

### List organizations

```
GET /api/league/organizations/
Access: Public
```

**Response `200`:** Array of Organization objects.

### Create organization

```
POST /api/league/organizations/
Access: Authenticated (any role)
```

**Request:**

```json
{ "name": "FUNAAB Sports", "description": "Optional" }
```

**Response `201`:** Organization object.

**Errors:** `400` — name empty.

**Notes:** `slug` is generated server-side from `name`.

### Retrieve organization

```
GET /api/league/organizations/<id>/
Access: Public
```

**Response `200`:** Organization object. `404` if unknown.

**No update or delete endpoint exists.**

---

## 5. Competitions

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
- `season` — legacy free-text field. Use the structured Season API (§6) for
  real season handling.

### List competitions

```
GET /api/league/competitions/
Access: Public
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `organization` | int | no | Filter by organization. |

**Response `200`:** Array of Competition objects.

### Create competition

```
POST /api/league/competitions/
Access: Authenticated (any role)
```

**Request:**

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

**Response `201`:** Competition object.

**Errors:** `400` — organization missing/invalid, name empty, invalid `type`,
invalid `status`.

**Notes:** `slug` generated server-side. `type` accepts `LEAGUE` or `CUP`.

### Retrieve competition

```
GET /api/league/competitions/<id>/
Access: Public
```

**Response `200`:** Competition object. `404` if unknown.

**No update endpoint.**

### Competition participation

```
GET    /api/league/competitions/<competition_id>/teams/       Access: Public
POST   /api/league/competitions/<competition_id>/teams/       Access: ADMIN
DELETE /api/league/competitions/<competition_id>/teams/<team_id>/   Access: ADMIN
```

**Team brief (list/add response):**

```json
{ "id": 1, "name": "Computer Science FC", "short_name": "CSFC", "slug": "computer-science-fc" }
```

**POST body:** `{"team_id": 1}`. Response `201` with the team brief.

**Rules:**
- A team must belong to the **same organization** as the competition.
- Adding an already-participating team is idempotent (no error, no duplicate).
- A team with **matches in the competition cannot be removed** — `400`.

**Errors:**
- `400` — wrong organization, team not participating (on delete), or team
  has matches (on delete).
- `403` — non-ADMIN.
- `404` — competition or team unknown.

---

## 6. Seasons & Stages

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

### List seasons

```
GET /api/league/competitions/<competition_id>/seasons/
Access: Public
```

### Create season

```
POST /api/league/competitions/<competition_id>/seasons/
Access: Authenticated (any role)
```

**Request:**

```json
{
  "name": "2026",
  "status": "DRAFT",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30"
}
```

**Response `201`:** Season object.

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

### List stages

```
GET /api/league/seasons/<season_id>/stages/
Access: Public
```

### Create stage

```
POST /api/league/seasons/<season_id>/stages/
Access: Authenticated (any role)
```

**Request:**

```json
{ "kind": "GAMEWEEK", "number": 1, "name": "", "start_date": null, "end_date": null }
```

**Response `201`:** Stage object.

**Errors:** `400` — invalid `kind`, kind mismatches the parent competition's
type (`LEAGUE` needs `GAMEWEEK`, `CUP` needs `ROUND`), duplicate `number` in
the season, or invalid date range.

### Retrieve stage

```
GET /api/league/stages/<id>/
Access: Public
```

---

## 7. Teams & Players

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

A team belongs to exactly one organization and can participate in multiple
competitions.

### List teams

```
GET /api/league/teams/
Access: Public
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `organization` | int | no | Filter by organization. |
| `competition` | int | no | Filter to teams participating in this competition. |

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

**Response `201`:** Team object.

**Errors:**
- `400` — a `competition_ids[i]` from a different organization.
- `400` — captain not a player on the team.

### Retrieve team

```
GET /api/league/teams/<id>/
Access: Public
```

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

### List players

```
GET /api/league/players/
Access: Public
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `team` | int | no | Filter by team. |

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

**Response `201`:** Player object.

**Errors:** `400` — shirt number out of range (1–99) or duplicated within the
team; invalid position.

### Retrieve player

```
GET /api/league/players/<id>/
Access: Public
```

---

## 8. Team Managers

A `TeamManager` is the relationship that grants a user the ability to manage a
team (including submitting that team's lineup). A user may manage multiple
teams; a team may have multiple managers.

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

**Request:** `{"user_id": 5}`. Response `201` with the TeamManager object.

Idempotent.

**Errors:** `400` — user missing; `403` — not ADMIN; `404` — team missing.

### Remove manager

```
DELETE /api/league/teams/<team_id>/managers/<user_id>/
Access: ADMIN
```

**Response `204`.**

**Errors:** `400` — user not a manager; `403` — not ADMIN.

### Who can manage a team

For actions that manage a team (currently lineup submission):

- **ADMIN** or Django **superuser** — any team.
- **TeamManager** — assigned teams only.
- **SCOUT** — only if explicitly assigned as a `TeamManager`.
- **USER** — never.
- **Anonymous** — never.

---

## 9. Matches

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

| Parameter | Type | Required | Description |
|---|---|---|---|
| `competition` | int | no | Filter by competition. |
| `team` | int | no | Matches where team is home OR away. |
| `status` | string | no | Literal `Match.status` value. |

**Response `200`:** Array of Match objects.

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

**Response `200`:** Match object. `404` if unknown.

**No match update endpoint.**

---

## 10. Match Events

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

Field requirements by event type:

| Type | `team_id` | `player_id` | `related_player_id` |
|---|---|---|---|
| `GOAL` | required | optional | optional (assister) |
| `YELLOW` | required | optional | must be `null` |
| `RED` | required | optional | must be `null` |
| `SUBSTITUTION` | required | required (going off) | required (coming on) |
| `HALFTIME` | optional | must be `null` | must be `null` |
| `FULLTIME` | optional | must be `null` | must be `null` |

**`related_player_id` semantics:**

- On `GOAL`: the assister (if known). Must be on the scoring team; cannot be
  the scorer.
- On `SUBSTITUTION`: the player coming **on**. Must already be on the team's
  submitted bench (see §11).
- All other event types: must be `null`.

**Response `201`:**

```json
{
  "event": { /* event object */ },
  "match": { /* updated Match object */ }
}
```

The parent `match` is returned so the frontend can display the new score,
status, and minute without an extra request.

**Errors:**

- `400` — invalid type, minute out of range (1–200), team not part of match,
  player not on event team, substitution rule violation, `related_player`
  misuse, match in a terminal status (`FINISHED`/`POSTPONED`/`CANCELLED`),
  duplicate `HALFTIME` or `FULLTIME`, `FULLTIME` before `HALFTIME`, or
  substitution player not in the submitted lineup.
- `403` — not SCOUT/ADMIN.
- `404` — match not found.

**Side effects** (server-side; no client action required):

- `Match.home_score` / `away_score` recomputed from all `GOAL` events.
- `Match.status` transitions: `SCHEDULED → LIVE` on the first in-play event;
  `HALFTIME` on `HALFTIME`; `FINISHED` on `FULLTIME`.
- `Match.minute` updated to the event's minute.
- `Match.started_at` / `finished_at` populated when applicable.
- On `SUBSTITUTION`, the `MatchLineup` rows for the outgoing and incoming
  players are updated.
- On `FULLTIME`, active lineup entries are closed at the fulltime minute.
- `FantasyPoints` for the match recalculated.
- A WebSocket broadcast is sent to connected clients (see §13).

---

## 11. Lineups

A lineup is a per-team submission of who is playing in a match. It is created
before the match starts and locked once the match leaves `SCHEDULED`.

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

- `team_id` in the body must match the URL.
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

**Atomicity:** Validation runs before any state change. A failed request never
modifies an existing lineup.

**Locking:** Once the match leaves `SCHEDULED` (first in-play event →
`LIVE`), lineup submission is rejected with `400`. There is no override.

---

## 12. Public Fixtures & Livescore

A single public, unauthenticated endpoint for the frontend's fixtures /
livescore page.

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

`stage` is `null` if the match has no stage.

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
  End boundary is exclusive. Same status exclusions.
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

**Examples:**

```
/api/public/matches/?date=today
/api/public/matches/?date=tomorrow
/api/public/matches/?date=week
/api/public/matches/?status=LIVE
/api/public/matches/?date=today&status=LIVE
/api/public/matches/?date=today&competition=3
/api/public/matches/?status=LIVE&organization=5
/api/public/matches/?date=week&competition=3&organization=5
```

**No pagination.**

---

## 13. Match WebSocket

### Connection

```
ws://<host>/ws/matches/<match_id>/
```

(Use `wss://` behind TLS.)

**Authentication:** None. Public.

### On connect

1. Server verifies the match exists. If not, closes the connection with code
   `4404`.
2. Server sends one `match_state` message.

### Message: `match_state`

Sent once, immediately after connection:

```json
{
  "type": "match_state",
  "match": { /* Match object — see §9 */ },
  "events": [ /* Event objects — see §10, ordered by (minute, created_at) */ ]
}
```

### Message: `match_event`

Sent every time a match event is successfully recorded on the match:

```json
{
  "type": "match_event",
  "event": { /* Event object */ },
  "match": { /* Updated Match object with new score/status/minute */ }
}
```

### Client → server

**No messages are accepted.** The WebSocket is read-only.

### Broadcast guarantees

- Broadcasts fire only after the underlying database transaction commits. A
  rolled-back event does not produce a message.
- Fantasy points for the match are recalculated before the broadcast. When a
  client receives `match_event`, fantasy scoring for that event has already
  completed.
- Fantasy points are **not** included in the WebSocket payload.

### Recommended frontend lifecycle

1. Fetch the matches the user is watching (e.g. via `/api/public/matches/?status=LIVE`).
2. Open a WebSocket per match that needs live updates.
3. On `match_state`, replace local state for the match.
4. On `match_event`, update the match (score/status/minute) and append the event.
5. Close the socket when the match leaves the live view or the component unmounts.

---

## 14. Fantasy Teams

A fantasy team belongs to **one user**, **one competition**, and **one season**.
A user may have multiple fantasy teams — one per `(competition, season)` pair.

### Fantasy team object

```json
{
  "id": 1,
  "name": "My Team",
  "competition": { "id": 3, "name": "Premier League", "slug": "premier-league" },
  "season": { "id": 1, "name": "2026", "slug": "2026", "status": "DRAFT", "start_date": "2026-03-01", "end_date": "2026-06-30" },
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

**Response `200`:** Array of FantasyTeam objects (the current user's teams).

### Create team

```
POST /api/fantasy/teams/
Access: Authenticated
```

**Request:**

```json
{ "name": "My Team", "competition_id": 3, "season_id": 1 }
```

**Response `201`:** FantasyTeam object.

**Errors:**
- `400` — user already has a fantasy team for this competition/season.
- `404` — `competition_id` or `season_id` missing.

### Retrieve team

```
GET /api/fantasy/teams/<team_id>/
Access: Authenticated + must own the team
```

**Response `200`:** FantasyTeam object.

### Update team

```
PATCH /api/fantasy/teams/<team_id>/
Access: Authenticated + must own the team
```

**Request:** `{"name": "New Name"}`

**Response `200`:** FantasyTeam object.

Only `name` is editable.

---

## 15. Fantasy Squads

A squad is scoped to a **stage** (gameweek or round). The same fantasy team
can have a different squad for each stage.

### Read squad

```
GET /api/fantasy/teams/<team_id>/squads/<stage_id>/
Access: Authenticated + must own the team
```

**Response `200`:**

```json
{
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
        "team": { "id": 1, "name": "Computer Science FC" }
      },
      "is_starter": true,
      "is_captain": true
    }
  ],
  "bench": [ /* 4 more selections */ ],
  "captain_id": 10
}
```

**Errors:** `400` — stage not in this fantasy team's season; `404` — team or
stage missing.

### Replace squad

```
PUT /api/fantasy/teams/<team_id>/squads/<stage_id>/
Access: Authenticated + must own the team
```

**Request:**

```json
{
  "selections": [
    { "player_id": 10, "is_starter": true,  "is_captain": true  },
    { "player_id": 11, "is_starter": true,  "is_captain": false }
  ]
}
```

**Response `200`:** Same shape as GET.

**Squad rules:**

- Exactly **15** players total
- Exactly **2** GK, **5** DEF, **5** MID, **3** ATT
- Exactly **11** starters
- Exactly **4** bench
- Exactly **1** captain
- Captain must be a starter
- No duplicate players
- Every selected player's team must participate in this fantasy team's competition
- Stage must belong to the fantasy team's season

**Errors:** `400` with `{"detail": "..."}` on any rule violation.

**Replacement behavior:** PUT replaces the entire squad for the given stage.
It does not merge.

**No transfers, budgets, player prices, chips, wildcards, or formations.**

---

## 16. Fantasy Leaderboard

### Global leaderboard

```
GET /api/fantasy/leaderboard/
Access: Authenticated
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `competition` | int | yes | Competition ID |
| `season` | int | yes | Season ID |
| `stage` | int | no | If present, scope to this stage; else season-wide |

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

Rows are sorted by `total_points` descending. Captain multiplier (×2) is
already applied. No email is exposed.

### Group leaderboard

```
GET /api/fantasy/groups/<group_id>/leaderboard/
Access: Authenticated + must be a member
```

**Query parameters:** Same as the global leaderboard.

**Response `200`:**

```json
{ "group_id": 3, "rows": [ /* same row shape */ ] }
```

**Errors:** `403` if not a member, `404` if the group doesn't exist.

---

## 17. Fantasy Groups

Groups are private, invite-code-based, and global (not scoped to a
competition/season).

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

### List my groups

```
GET /api/fantasy/groups/
Access: Authenticated
```

### Create group

```
POST /api/fantasy/groups/
Access: Authenticated
```

**Request:** `{"name": "Fam"}`

**Response `201`:** Fantasy group object. Creator is added as a member.

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
Access: Authenticated + must be a member
```

**Response `204`.**

**Errors:** `400` — the caller is the owner (owners cannot leave) or is not a
member.

### Remove member

```
POST /api/fantasy/groups/<group_id>/members/<user_id>/remove/
Access: Authenticated + must be the group owner
```

**Response `204`.**

**Errors:** `400` — not the owner, attempting to remove self, or target not a
member.

**No invitations, no ownership transfer.**

---

## 18. Fantasy Scoring

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
| **Captain multiplier** | ×2 on the captain's per-stage points |

### How minutes are determined

Minutes come from the submitted `MatchLineup`:

- Starter who plays the full match → minutes = final match minute.
- Starter subbed off at minute N → N minutes.
- Bench player subbed on at minute N, off at M → (M − N) minutes.
- Bench player never used → 0 minutes.
- No lineup submitted → 0 minutes for all players.

The 60+ bonus applies at exactly 60 minutes or more.

### Clean sheets

Awarded to GK or DEF only when:

- The player played ≥ 60 minutes.
- The player did not receive a red card.
- The opponent scored 0 goals.

### Assists

Represented via `related_player_id` on a `GOAL` event. Assists require the
Scout to record them — matches without recorded assists will not award assist
points.

### Determinism

Fantasy points are recomputed from match events. If a match event is corrected
or removed, points for that match are recalculated automatically.

### Per-team totals

A fantasy team's total is calculated from its **starting XI** for each stage:

- Each starter's per-match points are summed across the stage.
- The captain's contribution is doubled.
- Bench players do not contribute to the team total.

---

## 19. Frontend Integration Guide

### Session / CSRF

Every request must include cookies:

```js
fetch(url, { credentials: "include" });
```

Every unsafe request must include the CSRF header:

```js
headers: { "X-CSRFToken": csrfTokenFromCookie }
```

The `csrftoken` cookie is set automatically when the user logs in or hits any
endpoint served through Django's CSRF middleware.

### Public fixtures

```text
GET /api/public/matches/?date=today
        ↓
Group results by competition client-side
        ↓
Render fixtures
        ↓
For LIVE/HALFTIME matches, connect WebSockets
```

### Live match

```text
GET /api/public/matches/?status=LIVE
        ↓
For each match:
    Open ws://<host>/ws/matches/<match_id>/
        ↓
    Receive match_state → hydrate UI
        ↓
    Receive match_event → update score/status/minute + append event
        ↓
    On unmount / match ends → close the socket
```

### Fantasy

```text
POST /api/accounts/login/
        ↓
POST /api/fantasy/teams/          (name, competition_id, season_id)
        ↓
GET  /api/fantasy/teams/<id>/
        ↓
GET  /api/fantasy/teams/<id>/squads/<stage_id>/
        ↓
PUT  /api/fantasy/teams/<id>/squads/<stage_id>/    (15-player squad)
        ↓
GET  /api/fantasy/leaderboard/?competition=<c>&season=<s>[&stage=<gw>]
        ↓
POST /api/fantasy/groups/          (create private group)
POST /api/fantasy/groups/join/     (join with invite code)
GET  /api/fantasy/groups/<id>/leaderboard/?competition=<c>&season=<s>
```

### Team management

```text
POST /api/accounts/login/          (as ADMIN, or as an assigned TeamManager)
        ↓
GET  /api/league/teams/<id>/managers/     (verify managers)
GET  /api/league/players/?team=<id>       (load eligible players)
GET  /api/matches/<match_id>/             (confirm match is SCHEDULED)
PUT  /api/matches/<match_id>/lineups/<team_id>/
        ↓
Lineup locks as soon as the match goes LIVE
```

### Display rules

Always display backend-calculated values. Never recompute:

- `match.home_score` / `match.away_score`
- `match.status` / `match.status_display`
- `match.minute`
- `fantasy_team.total_points`
- leaderboard rank
- fantasy scoring contributions

The backend is the source of truth for all of the above.

---

## 20. MVP Limitations

Current boundaries of the backend. These are intentional MVP choices, not bugs.

### General

- **No API versioning.** Paths are stable but unversioned.
- **No pagination.** All list endpoints return the full result set.
- **No OpenAPI / Swagger schema.**
- **No rate limiting.**
- **`401` vs `403`.** Protected endpoints return `403` for anonymous users
  because the backend uses only `SessionAuthentication`.

### League

- No update endpoints for organizations, competitions, seasons, stages,
  teams, or players.
- No organization-scoped admin. The global `ADMIN` role is the stand-in for
  competition administration.
- No historical player transfers.

### Matches

- No match update endpoint.
- No lineup versioning or history.
- No lineup override after kickoff.
- No dedicated `/api/matches/live/` endpoint. Use `?status=LIVE`.
- No client-to-server WebSocket messages.

### Public API

- No dedicated "today by competition" endpoint. Group
  `/api/public/matches/?date=today` client-side.
- No pagination.

### Fantasy

- No transfers, budgets, player prices, chips, wildcards, or formations.
- No automatic substitutions.
- No standalone fantasy-points endpoint. Fantasy points are only readable via
  team totals and leaderboards.
- No fantasy WebSocket.
- No group ownership transfer.
- Groups are not scoped to a competition/season.
- No invite-code rotation.
- Leaderboards are recomputed per request (no caching).

---

## Contract Changes

If the backend changes a response or behavior:

1. Update this document.
2. Notify the frontend developer.
3. Update the frontend.
4. Test the affected flow.

Do not silently change API fields.