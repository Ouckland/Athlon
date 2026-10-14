from django.db.models import Sum

from league.models import Stage

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
    from fantasy.services.chips import get_scoring_selections

    teams = list(teams)
    if not teams:
        return []

    if stage is not None:
        # ---- Stage scope: unchanged ----
        sels_by_team = {}
        player_ids = set()
        for team in teams:
            sels = list(
                get_scoring_selections(fantasy_team=team, stage=stage)
                .filter(is_starter=True)
            )
            sels_by_team[team.id] = sels
            for s in sels:
                player_ids.add(s.player_id)

        pts_by_player = {}
        if player_ids:
            qs = (
                FantasyPoints.objects
                .filter(
                    player_id__in=player_ids,
                    match__competition=competition,
                    match__stage=stage,
                )
                .values("player_id")
                .annotate(total=Sum("points"))
            )
            pts_by_player = {r["player_id"]: r["total"] for r in qs}

        result_rows = []
        for team in teams:
            total = 0
            for sel in sels_by_team.get(team.id, []):
                pts = pts_by_player.get(sel.player_id, 0)
                if sel.is_captain:
                    pts *= CAPTAIN_MULTIPLIER
                total += pts
            result_rows.append(
                {"fantasy_team": team, "total_points": total}
            )
        result_rows.sort(key=lambda r: r["total_points"], reverse=True)
        return result_rows

    # ---- Season scope ----
    # For every stage in the season that has a match, resolve the
    # effective captain for each team. Under carry-forward, the captain
    # designation extends to every stage where the squad carried
    # forward unchanged.
    from matches.models import Match

    season_stage_ids = list(
        Match.objects
        .filter(competition=competition, stage__season=season)
        .values_list("stage_id", flat=True)
        .distinct()
    )

    # Map (team_id, stage_id) -> set of captain player_ids who were
    # effective for that stage.
    captains_by_team_stage = {}
    # Also collect every starter player_id per team (union across stages).
    players_by_team = {}
    # Keep the full set of player_ids we need points for.
    all_player_ids = set()

    stages_by_id = {
        s.id: s
        for s in Stage.objects.filter(id__in=season_stage_ids)
    }

    for team in teams:
        players_by_team[team.id] = set()
        for sid in season_stage_ids:
            stg = stages_by_id.get(sid)
            if stg is None:
                continue
            sels = list(
                get_scoring_selections(fantasy_team=team, stage=stg)
                .filter(is_starter=True)
            )
            captain_ids = set()
            for sel in sels:
                players_by_team[team.id].add(sel.player_id)
                all_player_ids.add(sel.player_id)
                if sel.is_captain:
                    captain_ids.add(sel.player_id)
            captains_by_team_stage[(team.id, sid)] = captain_ids

    # Points per (player, stage).
    pts_by_player_stage = {}
    if all_player_ids:
        qs = (
            FantasyPoints.objects
            .filter(
                player_id__in=all_player_ids,
                match__competition=competition,
                match__stage__season=season,
            )
            .values("player_id", "match__stage_id")
            .annotate(total=Sum("points"))
        )
        for r in qs:
            pts_by_player_stage[(r["player_id"], r["match__stage_id"])] = r["total"]

    result_rows = []
    for team in teams:
        captain_map = {
            sid: captains_by_team_stage.get((team.id, sid), set())
            for sid in season_stage_ids
        }
        total = 0
        for pid in players_by_team.get(team.id, set()):
            for (ppid, sid), pts in pts_by_player_stage.items():
                if ppid != pid:
                    continue
                if pid in captain_map.get(sid, set()):
                    total += pts * CAPTAIN_MULTIPLIER
                else:
                    total += pts
        result_rows.append(
            {"fantasy_team": team, "total_points": total}
        )

    result_rows.sort(key=lambda r: r["total_points"], reverse=True)
    return result_rows


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