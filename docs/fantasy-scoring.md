# Athlon — Fantasy Scoring

## Principle

Fantasy points are generated from real match events.

Match Event
    ↓
Fantasy Engine
    ↓
Player Points
    ↓
Fantasy Team Points
```

Users never manually enter points.

---

# MVP Formation

Each fantasy team selects:

```text
1 Goalkeeper
3 Defenders
3 Midfielders
3 Forwards
```

Total:

```text
10 players
```

The remaining squad/bench system is optional and should not block MVP.

---

# Captain

The user selects one captain.

Captain receives:

```text
2 × normal points
```

---

# Initial Scoring

| Action      | Points |
| ----------- | -----: |
| Appearance  |     +1 |
| 60+ minutes |     +1 |
| GK Goal     |    +10 |
| DEF Goal    |     +6 |
| MID Goal    |     +5 |
| FWD Goal    |     +4 |
| Assist      |     +3 |
| Clean Sheet |     +4 |
| Yellow Card |     -1 |
| Red Card    |     -3 |

These values are configurable.

Do not hardcode scoring logic throughout the application.

---

# Example

Player:

```text
Adekunle
MID
```

Match:

```text
Goal
Assist
```

Points:

```text
5 + 3 = 8
```

If Adekunle is captain:

```text
8 × 2 = 16
```

---

# Important

Fantasy calculations must be reproducible.

Given the same match events, Athlon should always produce the same fantasy score.

This makes corrections and recalculation possible.
