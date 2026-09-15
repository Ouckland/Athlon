# Athlon — Architecture

## Stack

### Backend

* Python
* Django
* Django REST Framework
* Django Channels
* PostgreSQL

### Frontend

* React
* PWA
* WebSockets

---

# Backend Structure

Suggested Django apps:

apps/
├── accounts/
├── schools/
├── teams/
├── competitions/
├── matches/
└── fantasy/

Keep apps focused.

Do not create an app for every tiny feature.


# Main Relationships

School
  ↓
Competition
  ↓
Teams
  ↓
Players

And:

Competition
  ↓
Matches
  ↓
MatchEvents

Fantasy connects to players and match events:

Player
  ↓
MatchEvent
  ↓
FantasyPoints
  ↓
FantasyTeam

---

# Source of Truth

`MatchEvent` is the source of truth for live match actions.

Example:

GOAL
player = 17
team = 4
minute = 67

The backend derives:

Score
Player stats
Fantasy points
League effects

Do not store the same information in multiple places unless there is a clear reason.


# Business Logic

Keep business logic out of views where possible.

Use services:

matches/services/
fantasy/services/

Example:

create_match_event()
process_goal()
calculate_fantasy_points()
update_standings()

Views should mainly handle:

Request
 ↓
Validation
 ↓
Service
 ↓
Response

---

# Permissions

Never trust the frontend for permissions.

Example:

PLAYER
  → cannot create live events

SCOUT
  → can update assigned matches

ADMIN
  → can manage everything

Backend always verifies permissions.

---

# Real-Time

Use Django Channels.

Each live match gets a WebSocket group:

match_42

When an event happens:

MatchEvent
   ↓
Process event
   ↓
Broadcast update
   ↓
match_42 group
   ↓
Connected React clients
```

---

# Event Safety

Events should be idempotent.

Every event should have a unique ID.

If the same event is submitted twice:

Request 1 → saved
Request 2 → ignored

This prevents duplicate goals and duplicate fantasy points.

---

# Important Rule

The backend is the **source of truth**.

React displays backend state.

React should not independently decide:

* Official score
* Fantasy points
* League points
* Whether an event is valid
