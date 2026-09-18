from django.db.models import Sum

from fantasy.models import (
    FantasyGroupMembership,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
)
from fantasy.services.scoring import CAPTAIN_MULTIPLIER


def _points_queryset(*, competition, season, stage, player_ids):
    """
    Scope FantasyPoints to a specific competition+season (and optionally
    a single stage). Prevents cross-season/competition leakage.
    """
    qs = FantasyPoints.objects.filter(
        player_id__in=player_ids,
        match__competition=competition,
        match__stage__season=season,
    )
    if stage is not None:
        qs = qs.filter(match__stage=stage)
    return qs

def _build_leaderboard(*, teams, competition, season, stage=None):
    teams = list(teams)
    if not teams:
        return []

    team_ids = [t.id for t in teams]
    sel_qs = FantasyPlayerSelection.objects.filter(
        fantasy_team_id__in=team_ids, is_starter=True
    )
    if stage is not None:
        sel_qs = sel_qs.filter(stage=stage)
    else:
        sel_qs = sel_qs.filter(stage__season=season)
    selections = list(
        sel_qs.only("id", "fantasy_team_id", "player_id", "is_captain", "stage_id")
    )

    sels_by_team = {}
    player_ids = set()
    for sel in selections:
        sels_by_team.setdefault(sel.fantasy_team_id, []).append(sel)
        player_ids.add(sel.player_id)

    # Aggregate per (player, stage). FantasyPoints has no stage FK, but Match
    # does, so we group by match__stage_id and scope by competition + season.
    points_by_player_stage = {}
    if player_ids:
        qs = FantasyPoints.objects.filter(
            player_id__in=player_ids,
            match__competition=competition,
            match__stage__season=season,
        )
        if stage is not None:
            qs = qs.filter(match__stage=stage)
        rows = (
            qs.values("player_id", "match__stage_id")
            .annotate(total=Sum("points"))
        )
        for row in rows:
            points_by_player_stage[(row["player_id"], row["match__stage_id"])] = (
                row["total"]
            )

    rows = []
    for team in teams:
        total = 0
        for sel in sels_by_team.get(team.id, []):
            pts = points_by_player_stage.get((sel.player_id, sel.stage_id), 0)
            if sel.is_captain:
                pts *= CAPTAIN_MULTIPLIER
            total += pts
        rows.append({"fantasy_team": team, "total_points": total})

    rows.sort(key=lambda r: r["total_points"], reverse=True)
    return rows


def fantasy_team_total_points(fantasy_team, stage=None):
    """Season-wide when stage is None; stage-scoped otherwise."""
    rows = _build_leaderboard(
        teams=[fantasy_team],
        competition=fantasy_team.competition,
        season=fantasy_team.season,
        stage=stage,
    )
    return rows[0]["total_points"] if rows else 0


def stage_leaderboard(*, competition, season, stage):
    return _build_leaderboard(
        teams=FantasyTeam.objects.select_related("user").filter(
            competition=competition, season=season
        ),
        competition=competition,
        season=season,
        stage=stage,
    )


def season_leaderboard(*, competition, season):
    return _build_leaderboard(
        teams=FantasyTeam.objects.select_related("user").filter(
            competition=competition, season=season
        ),
        competition=competition,
        season=season,
        stage=None,
    )


def group_stage_leaderboard(*, group, competition, season, stage):
    user_ids = list(
        FantasyGroupMembership.objects.filter(group=group).values_list(
            "user_id", flat=True
        )
    )
    return _build_leaderboard(
        teams=FantasyTeam.objects.select_related("user").filter(
            user_id__in=user_ids, competition=competition, season=season
        ),
        competition=competition,
        season=season,
        stage=stage,
    )


def group_season_leaderboard(*, group, competition, season):
    user_ids = list(
        FantasyGroupMembership.objects.filter(group=group).values_list(
            "user_id", flat=True
        )
    )
    return _build_leaderboard(
        teams=FantasyTeam.objects.select_related("user").filter(
            user_id__in=user_ids, competition=competition, season=season
        ),
        competition=competition,
        season=season,
        stage=None,
    )