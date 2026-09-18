from django.db.models import Sum

from fantasy.models import FantasyPlayerSelection, FantasyPoints
from fantasy.services.teams import (
    FantasyError,
    validate_stage_for_fantasy,
)


CAPTAIN_MULTIPLIER = 2


def get_gameweek_points(*, fantasy_team, stage):
    """
    Aggregate a fantasy team's points for one gameweek.

    - Reads the fantasy team's selections for the given stage (historical
      squads for other stages are never touched).
    - Sums each selected player's base points across every match in that
      stage, using the existing `FantasyPoints` rows (which are derived from
      MatchEvent data by the matches/fantasy scoring layer).
    - Applies the captain multiplier to the captain's contribution.
    - Bench points are surfaced separately and never contribute to the
      team total.

    Pure read: never mutates the database.

    Raises FantasyError if `stage` is not a valid fantasy stage for this
    fantasy team (must be GAMEWEEK, same season, same competition).
    """
    validate_stage_for_fantasy(fantasy_team=fantasy_team, stage=stage)

    selections = list(
        FantasyPlayerSelection.objects
        .filter(fantasy_team=fantasy_team, stage=stage)
        .select_related("player", "player__team")
        .order_by("-is_starter", "player_id")
    )

    player_ids = [s.player_id for s in selections]

    points_by_player = {}
    if player_ids:
        rows = (
            FantasyPoints.objects
            .filter(player_id__in=player_ids, match__stage=stage)
            .values("player_id")
            .annotate(total=Sum("points"))
        )
        points_by_player = {row["player_id"]: row["total"] for row in rows}

    players_payload = []
    starting_xi_points = 0
    bench_points = 0

    for sel in selections:
        base_points = points_by_player.get(sel.player_id, 0) or 0
        is_captain = bool(sel.is_captain)
        multiplier = CAPTAIN_MULTIPLIER if is_captain else 1
        contribution = base_points * multiplier

        players_payload.append(
            {
                "player": sel.player,
                "is_starter": sel.is_starter,
                "is_captain": is_captain,
                "base_points": base_points,
                "multiplier": multiplier,
                "points": contribution,
            }
        )

        if sel.is_starter:
            starting_xi_points += contribution
        else:
            # Bench never carries the multiplier (captain must be a starter),
            # so base_points == contribution. Reported for display only.
            bench_points += base_points

    return {
        "stage": stage,
        "total_points": starting_xi_points,
        "starting_xi_points": starting_xi_points,
        "bench_points": bench_points,
        "players": players_payload,
    }