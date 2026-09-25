from django.db.models import Sum

from fantasy.models import FantasyChipUse, FantasyPoints
from fantasy.services.chips import get_active_chip, get_scoring_selections
from fantasy.services.teams import FantasyError, validate_stage_for_fantasy


CAPTAIN_MULTIPLIER = 2
TRIPLE_CAPTAIN_MULTIPLIER = 3


def get_gameweek_points(*, fantasy_team, stage):
    validate_stage_for_fantasy(fantasy_team=fantasy_team, stage=stage)

    active = get_active_chip(fantasy_team=fantasy_team, stage=stage)
    chip_type = active.chip_type if active else None

    is_triple = chip_type == FantasyChipUse.Chip.TRIPLE_CAPTAIN
    is_bench_boost = chip_type == FantasyChipUse.Chip.BENCH_BOOST
    captain_multiplier = (
        TRIPLE_CAPTAIN_MULTIPLIER if is_triple else CAPTAIN_MULTIPLIER
    )

    # Historical scoring always uses the scoring selections, which are
    # permanent for non-FH stages and the FH squad forever for FH stages.
    selections = list(
        get_scoring_selections(fantasy_team=fantasy_team, stage=stage)
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
        points_by_player = {r["player_id"]: r["total"] for r in rows}

    players_payload = []
    starting_xi_points = 0
    bench_points = 0

    for sel in selections:
        base = points_by_player.get(sel.player_id, 0) or 0
        is_captain = bool(sel.is_captain)
        mult = captain_multiplier if is_captain else 1
        contribution = base * mult
        players_payload.append({
            "player": sel.player,
            "is_starter": sel.is_starter,
            "is_captain": is_captain,
            "base_points": base,
            "multiplier": mult,
            "points": contribution,
        })
        if sel.is_starter:
            starting_xi_points += contribution
        else:
            bench_points += base

    total_points = (
        starting_xi_points + bench_points if is_bench_boost else starting_xi_points
    )

    return {
        "stage": stage,
        "active_chip": chip_type,
        "total_points": total_points,
        "starting_xi_points": starting_xi_points,
        "bench_points": bench_points,
        "players": players_payload,
    }