from django.db.models import Q

from league.models import Player
from matches.models import Match, MatchEvent, MatchLineup
from fantasy.models import FantasyPoints


SCORING_RULES = {
    "appearance": 1,
    "minutes_60_plus": 1,
    "goal_GK": 10,
    "goal_DEF": 6,
    "goal_MID": 5,
    "goal_ATT": 4,
    "assist": 3,
    "clean_sheet": 4,
    "yellow_card": -1,
    "red_card": -3,
}

CAPTAIN_MULTIPLIER = 2

CLEAN_SHEET_MIN_MINUTES = 60


# ---------------------------------------------------------------------------
# Per-player scoring
# ---------------------------------------------------------------------------
def score_player_for_match(player, match):
    """
    Deterministic. Returns (points, breakdown).
    Assists are attributed via GOAL events where related_player == player.
    Minutes come from matches.services.lineup.get_player_minutes().
    """
    from matches.services.lineup import get_player_minutes

    events = list(
        MatchEvent.objects.filter(match=match)
        .filter(Q(player=player) | Q(related_player=player))
        .order_by("minute", "created_at")
    )

    minutes = get_player_minutes(player, match)
    if minutes <= 0:
        return 0, {}

    breakdown = {"appearance": SCORING_RULES["appearance"]}

    if minutes >= 60:
        breakdown["minutes_60_plus"] = SCORING_RULES["minutes_60_plus"]

    # Goals — only events where this player is the scorer.
    goal_count = sum(
        1
        for e in events
        if e.type == MatchEvent.Type.GOAL and e.player_id == player.id
    )
    if goal_count:
        breakdown["goals"] = goal_count * SCORING_RULES.get(
            f"goal_{player.position}", 0
        )

    # Assists — GOAL events where this player is the related_player.
    assist_count = sum(
        1
        for e in events
        if e.type == MatchEvent.Type.GOAL and e.related_player_id == player.id
    )
    if assist_count:
        breakdown["assists"] = assist_count * SCORING_RULES["assist"]

    # Cards.
    yellow_count = sum(
        1 for e in events
        if e.type == MatchEvent.Type.YELLOW and e.player_id == player.id
    )
    if yellow_count:
        breakdown["yellow_cards"] = yellow_count * SCORING_RULES["yellow_card"]

    red_count = sum(
        1 for e in events
        if e.type == MatchEvent.Type.RED and e.player_id == player.id
    )
    if red_count:
        breakdown["red_cards"] = red_count * SCORING_RULES["red_card"]

    if _gets_clean_sheet(player, match, minutes, events):
        breakdown["clean_sheet"] = SCORING_RULES["clean_sheet"]

    return sum(breakdown.values()), breakdown


def _gets_clean_sheet(player, match, minutes, events):
    """
    A player earns clean-sheet points iff:
      - position is GK or DEF
      - played >= CLEAN_SHEET_MIN_MINUTES minutes
      - was not sent off
      - their side conceded 0 goals (counted from opponent GOAL events)
    """
    if player.position not in (Player.Position.GK, Player.Position.DEF):
        return False
    if minutes < CLEAN_SHEET_MIN_MINUTES:
        return False
    if any(
        e.type == MatchEvent.Type.RED and e.player_id == player.id
        for e in events
    ):
        return False

    if player.team_id == match.home_team_id:
        opponent_id = match.away_team_id
    elif player.team_id == match.away_team_id:
        opponent_id = match.home_team_id
    else:
        return False

    opponent_goals = MatchEvent.objects.filter(
        match=match, type=MatchEvent.Type.GOAL, team_id=opponent_id
    ).count()
    return opponent_goals == 0


# ---------------------------------------------------------------------------
# Whole-match calculation
# ---------------------------------------------------------------------------
def calculate_match_points(match):
    """
    Create or update FantasyPoints rows for every participant of the match,
    where "participants" = union of:
      - players with any MatchEvent (scorer, card, sub-on/off, etc.)
      - players in the submitted MatchLineup
    This ensures a starter who scores no goals still gets appearance points.
    """
    event_player_ids = set(
        MatchEvent.objects.filter(match=match).values_list("player_id", flat=True)
    )
    event_related_ids = set(
        MatchEvent.objects.filter(match=match).values_list(
            "related_player_id", flat=True
        )
    )
    lineup_ids = set(
        MatchLineup.objects.filter(match=match).values_list("player_id", flat=True)
    )

    player_ids = {
        pid
        for pid in (event_player_ids | event_related_ids | lineup_ids)
        if pid is not None
    }

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
    FantasyPoints.objects.filter(match=match).delete()
    return calculate_match_points(match)