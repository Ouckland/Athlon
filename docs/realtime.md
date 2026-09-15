# Athlon — Real-Time System

## Goal

When a scout records an event, users watching the match should see the update without refreshing.


# Flow

Scout
  ↓
POST Match Event
  ↓
Django
  ↓
Validate Event
  ↓
Save Event
  ↓
Process Event
  ├── Update Score
  ├── Update Player Stats
  └── Update Fantasy
  ↓
Broadcast WebSocket Event
  ↓
React


# WebSocket

Each live match has its own channel/group.

Example:

/ws/matches/42/

A React client joins the match channel.

When something happens, Django broadcasts an event.

Example:

json
{
  "type": "match.event",
  "event": "goal",
  "match_id": 42,
  "minute": 67,
  "player_id": 31,
  "team_id": 7,
  "home_score": 2,
  "away_score": 1
}

React uses this to update the UI.


# Event Types

MVP:

goal
yellow_card
red_card
substitution
half_time
full_time


# Scout Flow

Open assigned match
       ↓
Start match
       ↓
Record event
       ↓
Select player/team
       ↓
Confirm
       ↓
Backend processes event
       ↓
Live update
```

The scout interface should be fast.

A live goal should take only a few taps to record.


# Duplicate Events

Every event gets a unique `event_id`.

Example:

event_id = 550e8400-e29b-41d4-a716-446655440000

If a network retry sends the same event again, the backend must not process it twice.


# Corrections

Events should not simply be deleted after affecting fantasy.

If an event was wrong:

Original Event
      ↓
Correction
      ↓
Recalculate affected data

This prevents incorrect fantasy points from remaining permanently.


# MVP Approach

Use WebSockets for live updates.

Do not build:

* Computer vision
* Automatic goal detection
* External sports-data feeds

The scout is the live data source for MVP.
