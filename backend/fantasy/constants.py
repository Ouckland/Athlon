from decimal import Decimal

# Default budget a fantasy team starts with. Applied to FantasyTeam.starting_budget.
DEFAULT_STARTING_BUDGET = Decimal("100.0")

# Per-player price bounds. FPL-style values.
MIN_PLAYER_PRICE = Decimal("4.0")
MAX_PLAYER_PRICE = Decimal("20.0")

ZERO = Decimal("0.0")