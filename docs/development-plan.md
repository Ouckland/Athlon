# Athlon — 7 Day Build Plan

## Constraint

Backend developer:

**3 hours/day × 7 days**

Frontend developer works in parallel.

The goal is a working MVP, not a complete product.

---

# Day 1 — Foundation

### Backend

* Project setup
* Apps
* User/auth
* School
* Competition
* Team
* Player
* Seed data

### Frontend

* React setup
* Routing
* Layout
* Navigation
* Basic design system
* API client

---

# Day 2 — Matches

### Backend

* Match model
* Match events
* Fixture API
* Match API
* Permissions

### Frontend

* Fixtures
* Match page
* Teams
* Players

---

# Day 3 — Live System

### Backend

* Django Channels
* WebSocket setup
* Scout permissions
* Event creation
* Score calculation
* Duplicate event protection

### Frontend

* Live match UI
* Event timeline
* WebSocket connection

---

# Day 4 — Fantasy

### Backend

* Fantasy team
* Player selection
* Captain
* Scoring engine
* Fantasy API

### Frontend

* Fantasy team builder
* Player selection
* Fantasy dashboard


# Day 5 — Integration

Test:

Goal
 ↓
Score
 ↓
WebSocket
 ↓
React
 ↓
Fantasy points
 ↓
Leaderboard

Fix integration issues.


# Day 6 — Real Match Simulation

Run a complete match:

START
 ↓
GOAL
 ↓
CARD
 ↓
SUBSTITUTION
 ↓
GOAL
 ↓
HALFTIME
 ↓
GOAL
 ↓
FULLTIME

Test multiple connected users.

Test duplicate events.

Test reconnecting WebSockets.


# Day 7 — Ship

Focus only on:

* Bugs
* Permissions
* Mobile/PWA
* Deployment
* Performance
* Basic security
* Final testing

No new major features.


# Definition of Done

Athlon is ready when:

Admin creates league / competition
        ↓
Teams and players exist
        ↓
Match is created
        ↓
Scout starts match
        ↓
Scout records goal
        ↓
Score updates
        ↓
React receives live event
        ↓
Fantasy points update
        ↓
Leaderboard updates
        ↓
Match finishes
        ↓
Standings update

If this works reliably, the MVP is done.
