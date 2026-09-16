from django.db.models import Sum

from fantasy.models import (
    FantasyGroupMembership,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
)
from fantasy.services.scoring import CAPTAIN_MULTIPLIER


def _build_leaderboard(teams):
    """
    Given an iterable of FantasyTeam, return rows sorted by total points
    (descending). Uses a small number of batched queries regardless of team
    count.
    """
    teams = list(teams)
    if not teams:
        return []

    team_ids = [t.id for t in teams]
    selections = (
        FantasyPlayerSelection.objects
        .filter(fantasy_team_id__in=team_ids, is_starter=True)
        .only("id", "fantasy_team_id", "player_id", "is_captain")
    )

    sels_by_team = {}
    player_ids = set()
    for sel in selections:
        sels_by_team.setdefault(sel.fantasy_team_id, []).append(sel)
        player_ids.add(sel.player_id)

    points_by_player = {
        row["player_id"]: row["total"]
        for row in FantasyPoints.objects
        .filter(player_id__in=player_ids)
        .values("player_id")
        .annotate(total=Sum("points"))
    } if player_ids else {}

    rows = []
    for team in teams:
        total = 0
        for sel in sels_by_team.get(team.id, []):
            pts = points_by_player.get(sel.player_id, 0)
            if sel.is_captain:
                pts *= CAPTAIN_MULTIPLIER
            total += pts
        rows.append({"fantasy_team": team, "total_points": total})

    rows.sort(key=lambda r: r["total_points"], reverse=True)
    return rows


def fantasy_team_total_points(fantasy_team):
    rows = _build_leaderboard([fantasy_team])
    return rows[0]["total_points"] if rows else 0


def global_leaderboard():
    return _build_leaderboard(
        FantasyTeam.objects.select_related("user").all()
    )


def group_leaderboard(group):
    user_ids = list(
        FantasyGroupMembership.objects
        .filter(group=group)
        .values_list("user_id", flat=True)
    )
    return _build_leaderboard(
        FantasyTeam.objects
        .select_related("user")
        .filter(user_id__in=user_ids)
    )