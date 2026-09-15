# Athlon — API Contract

The API is the contract between Django and React.

Frontend should not depend on Django implementation details.


# API Rules

Use JSON.

Example:

GET /api/matches/
GET /api/matches/{id}/
POST /api/matches/{id}/events/

Authentication should use the agreed auth mechanism for the project.

---

# Match Response

Example:

{
  "id": 42,
  "home_team": {
    "id": 1,
    "name": "Computer Science FC"
  },
  "away_team": {
    "id": 2,
    "name": "Engineering FC"
  },
  "home_score": 2,
  "away_score": 1,
  "status": "LIVE",
  "minute": 67
}


# Match Event

Example request:

{
  "event_id": "uuid",
  "type": "goal",
  "team_id": 1,
  "player_id": 17,
  "minute": 67
}

Response:

{
  "id": "uuid",
  "type": "goal",
  "team_id": 1,
  "player_id": 17,
  "minute": 67,
  "score": {
    "home": 2,
    "away": 1
  }
}


# Frontend Rule

React should display backend state.

Do not duplicate business rules in React.

Bad:

React calculates fantasy points

Good:

Django calculates
        ↓
React displays


# WebSocket Contract

Example:

{
  "type": "match.event",
  "event": "goal",
  "match_id": 42,
  "minute": 67,
  "player_id": 17,
  "team_id": 1,
  "home_score": 2,
  "away_score": 1
}

The WebSocket payload should contain enough information for the UI to update without immediately making another request.

---

# Contract Changes

If the backend changes a response:

1. Tell the frontend developer.
2. Update this document.
3. Update the frontend.
4. Test the affected flow.

Do not silently change API fields.
