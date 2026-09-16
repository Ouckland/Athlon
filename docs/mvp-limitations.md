Absolutely. I’ll keep a **single running Athlon “Post-MVP Limitations” backlog** and add to it whenever we deliberately accept a shortcut, approximation, or missing capability during MVP development.

### Athlon — Post-MVP Limitations

#### Fantasy

* [ ] **Exact minutes played** — current scoring uses a heuristic based on substitution events.
* [ ] **Clean-sheet scoring is approximate** — currently depends on event participation and doesn't fully model when a player entered/left.
* [ ] **Assists unsupported** — `MatchEvent` doesn't currently have explicit assist semantics.
* [ ] **Fantasy not competition/season/gameweek scoped** — leaderboard and points are currently global.
* [ ] **Fantasy squad not competition-scoped** — players aren't currently restricted to a particular competition.
* [ ] **Players with no match events don't get a `FantasyPoints` row** — they effectively score 0, but this isn't explicitly persisted.
* [ ] **Automatic fantasy recalculation integration** — MatchEvents need to automatically trigger fantasy point recalculation after successful commits.

#### Match / Live Scores

* [ ] **Match correction/audit system** — corrections currently aren't designed as a full event-history/audit workflow.
* [ ] **Advanced event semantics** — MatchEvents are intentionally simplified for MVP.
* [ ] **Computer-assisted/automated match tracking** — future; MVP uses human scouts.

#### Realtime

* [ ] **In-memory Channels layer** — suitable for MVP/local use, but production multi-process deployment should move to Redis or another shared channel layer.
* [ ] **Realtime reliability/reconnection sophistication** — current WebSocket implementation is intentionally basic.

#### Groups

* [ ] **Invite-code collision retry robustness** — DB uniqueness protects correctness, but the generation flow could handle rare collisions more gracefully.

### Rule for this list

I'll distinguish between:

**MVP blocker** → must fix before MVP is considered ready.
**Post-MVP limitation** → acceptable shortcut; record it and move on.

And I won't turn every imperfection into a refactoring task. The goal is to **finish Athlon MVP first, then systematically come back to this list.**
