from django.db.models import Q

from league.models import Player
from matches.models import Match, MatchEvent

from fantasy.models import FantasyPoints


# ---------------------------------------------------------------------------
# Scoring configuration
# ---------------------------------------------------------------------------
# NOTE: "assist" is listed for documentation/future use. It CANNOT currently
# be awarded — the MatchEvent model does not carry assist information.
# Do not remove this entry; when the assist rule becomes calculable, the
# scoring code below just needs to look up SCORING_RULES["assist"].
SCORING_RULES = {
    "appearance": 1,
    "minutes_60_plus": 1,
    "goal_GK": 10,
    "goal_DEF": 6,
    "goal_MID": 5,
    "goal_ATT": 4,
    "assist": 3,         # UNSUPPORTED — see module docstring above
    "clean_sheet": 4,
    "yellow_card": -1,
    "red_card": -3,
}

# Captain multiplier is applied at the fantasy-team aggregation layer, NOT
# inside score_player_for_match() — the same player can be captain on one
# fantasy team and a normal starter on another.
CAPTAIN_MULTIPLIER = 2


# ---------------------------------------------------------------------------
# Per-player scoring
# ---------------------------------------------------------------------------
def score_player_for_match(player, match):
    """
    Deterministic: given the same MatchEvent rows for `match`, returns the
    same (points, breakdown) tuple every call. Pure function of DB state.

    A player with no events returns (0, {}).
    """
    events = list(
        MatchEvent.objects.filter(match=match)
        .filter(Q(player=player) | Q(related_player=player))
        .order_by("minute", "created_at")
    )

    if not events:
        return 0, {}

    breakdown = {}

    # Appearance — any event at all implies the player was involved.
    breakdown["appearance"] = SCORING_RULES["appearance"]

    # Goals — position drives the value.
    goal_count = sum(
        1
        for e in events
        if e.type == MatchEvent.Type.GOAL and e.player_id == player.id
    )
    if goal_count:
        key = f"goal_{player.position}"
        per_goal = SCORING_RULES.get(key, 0)
        breakdown["goals"] = goal_count * per_goal

    # Cards.
    yellow_count = sum(
        1
        for e in events
        if e.type == MatchEvent.Type.YELLOW and e.player_id == player.id
    )
    if yellow_count:
        breakdown["yellow_cards"] = yellow_count * SCORING_RULES["yellow_card"]

    red_count = sum(
        1
        for e in events
        if e.type == MatchEvent.Type.RED and e.player_id == player.id
    )
    if red_count:
        breakdown["red_cards"] = red_count * SCORING_RULES["red_card"]

    # 60+ minutes — approximated from substitution events.
    if _played_60_plus(player, events):
        breakdown["minutes_60_plus"] = SCORING_RULES["minutes_60_plus"]

    # Clean sheet — GK/DEF only, and only when their side conceded 0 goals.
    if _gets_clean_sheet(player, match):
        breakdown["clean_sheet"] = SCORING_RULES["clean_sheet"]

    total = sum(breakdown.values())
    return total, breakdown


def _played_60_plus(player, events):
    """
    Approximate from SUBSTITUTION events only.

    - Subbed off before minute 60  -> False
    - Subbed on after minute 30    -> False
    - Otherwise                    -> True

    A real match lineup is not stored, so this is the best signal available.
    """
    for e in events:
        if e.type != MatchEvent.Type.SUBSTITUTION:
            continue
        if e.player_id == player.id and e.minute < 60:
            return False
        if e.related_player_id == player.id and e.minute > 30:
            return False
    return True


def _gets_clean_sheet(player, match):
    """
    Clean-sheet points for GK/DEF whose side did not concede.

    MVP approximation: opponent goals are counted from GOAL MatchEvents.
    A real lineup is not stored, so only players who have at least one event
    in the match are eligible.
    """
    if player.position not in (Player.Position.GK, Player.Position.DEF):
        return False

    if player.team_id == match.home_team_id:
        opponent_id = match.away_team_id
    elif player.team_id == match.away_team_id:
        opponent_id = match.home_team_id
    else:
        return False

    opponent_goals = MatchEvent.objects.filter(
        match=match,
        type=MatchEvent.Type.GOAL,
        team_id=opponent_id,
    ).count()
    return opponent_goals == 0


# ---------------------------------------------------------------------------
# Whole-match calculation
# ---------------------------------------------------------------------------
def calculate_match_points(match):
    """
    Create or update FantasyPoints for every player with any MatchEvent in
    `match`. Idempotent.

    Returns the list of FantasyPoints rows written.
    """
    player_ids = set(
        MatchEvent.objects.filter(match=match)
        .values_list("player_id", flat=True)
    )
    related_ids = set(
        MatchEvent.objects.filter(match=match)
        .values_list("related_player_id", flat=True)
    )
    player_ids = {pid for pid in (player_ids | related_ids) if pid is not None}

    players = Player.objects.filter(id__in=player_ids)

    written = []
    for player in players:
        points, breakdown = score_player_for_match(player, match)
        fp, _ = FantasyPoints.objects.update_or_create(
            match=match,
            player=player,
            defaults={"points": points, "breakdown": breakdown},
        )
        written.append(fp)
    return written


def recalculate_match_points(match):
    """
    Wipe and re-derive all FantasyPoints for a match. Same result as
    calculate_match_points() but guarantees no stale rows remain (e.g. after
    a MatchEvent was deleted).
    """
    FantasyPoints.objects.filter(match=match).delete()
    return calculate_match_points(match)