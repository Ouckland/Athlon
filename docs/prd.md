# Athlon — MVP PRD

## 1. Users

### Student / Player

Can:

    * Register/login
    * View matches
    * Follow live matches
    * View teams and players
    * View standings
    * Create fantasy team
    * View fantasy points
    * View fantasy leaderboard

### Scout

A person physically watching the match and entering live events.

Can:

    * Start a match
    * Record goals
    * Record cards
    * Record substitutions
    * End a match
    * Correct events

### Admin

Can:

    * Manage schools
    * Manage competitions
    * Manage teams
    * Manage players
    * Create fixtures
    * Manage scouts


# 2. Core Features

## Authentication

* Register
* Login
* Logout
* User profile
* Role-based permissions

Roles:

PLAYER
SCOUT
ADMIN


## Schools

A school owns competitions.

Example:

FUNAAB
└── 2026/27 Football League


## Teams

Teams belong to a competition/school.

A team has:

* Name
* Logo
* Players


## Players

A player has:

* Name
* Photo
* Position
* Shirt number
* Team


## Matches

A match contains:

* Competition
* Home team
* Away team
* Date/time
* Status
* Score
* Events

Statuses:

UPCOMING
LIVE
HALFTIME
FULLTIME
POSTPONED
CANCELLED


# 3. Live Match

The match event is the source of truth.

MVP events:

GOAL
YELLOW_CARD
RED_CARD
SUBSTITUTION

Match lifecycle:

UPCOMING
   ↓
LIVE
   ↓
HALFTIME
   ↓
LIVE
   ↓
FULLTIME

A goal should automatically affect:

* Match score
* Match timeline
* Player stats
* Fantasy points
* Fantasy leaderboard


# 4. Fantasy Football

Users can:

* Create one fantasy team
* Select players
* Select starting XI
* Select captain
* View points
* View leaderboard

MVP uses a fixed formation.

Example:

1 GK
3+ DEF
3+ MID
3+ FWD

Fantasy points come from real match events.

Users do **not** manually enter fantasy points.


# 5. League Table

Standings are calculated from completed matches.

Win  = 3 points
Draw = 1 point
Loss = 0 points

Include:

* Played
* Wins
* Draws
* Losses
* Goals For
* Goals Against
* Goal Difference
* Points


# 6. Real-Time Updates

Live updates use WebSockets.

Flow:

Scout
  ↓
Django API
  ↓
Match Event
  ↓
Business Logic
  ↓
WebSocket
  ↓
React

The frontend should not calculate the official score or fantasy points.

The backend is the source of truth.


# 7. Out of Scope

Do not build these in MVP:

* Social feed
* Comments
* Chat
* Player ratings
* Tournament builder
* Transfers
* Fantasy chips
* Private fantasy leagues
* Push notifications
* Payments
* Advanced analytics
* Computer vision
* Automated goal detection
* Multiple sports

## MVP Success

The MVP is successful if a real school match can be:

Created
  ↓
Started
  ↓
Updated live
  ↓
Scored
  ↓
Finished
  ↓
Reflected in standings
  ↓
Reflected in fantasy
