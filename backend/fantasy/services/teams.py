from collections import Counter

from django.db import transaction

from league.models import Player

from fantasy.models import FantasyPlayerSelection, FantasyTeam


class FantasyError(Exception):
    """Raised when a fantasy domain rule is violated."""


SQUAD_SIZE = 15
STARTERS = 11
BENCH = 4
POSITION_REQUIREMENTS = {"GK": 2, "DEF": 5, "MID": 5, "ATT": 3}


def create_fantasy_team(*, user, name, competition, season):
    if not name or not name.strip():
        raise FantasyError("Fantasy team name is required.")
    if season.competition_id != competition.id:
        raise FantasyError("Season does not belong to this competition.")
    if FantasyTeam.objects.filter(user=user, competition=competition, season=season).exists():
        raise FantasyError("You already have a fantasy team in this competition/season.")
    return FantasyTeam.objects.create(
        user=user, name=name.strip(), competition=competition, season=season
    )


def validate_player_eligibility(player, competition):
    """
    A player is eligible iff their team participates in the competition.
    Uses the existing Team.competitions M2M — no historical model.
    """
    return player.team.competitions.filter(id=competition.id).exists()


def set_squad(*, fantasy_team, stage, selections):
    """
    Replace the fantasy team's squad for a given stage.

    `selections` is a list of dicts:
        {"player_id": int, "is_starter": bool, "is_captain": bool}
    """
    if stage.season_id != fantasy_team.season_id:
        raise FantasyError("Stage does not belong to this fantasy team's season.")
    _validate_squad(fantasy_team, selections)

    with transaction.atomic():
        fantasy_team.selections.filter(stage=stage).delete()
        FantasyPlayerSelection.objects.bulk_create(
            [
                FantasyPlayerSelection(
                    fantasy_team=fantasy_team,
                    stage=stage,
                    player_id=s["player_id"],
                    is_starter=bool(s["is_starter"]),
                    is_captain=bool(s.get("is_captain", False)),
                )
                for s in selections
            ]
        )
    return fantasy_team


def _validate_squad(fantasy_team, selections):
    if len(selections) != SQUAD_SIZE:
        raise FantasyError(f"Squad must have exactly {SQUAD_SIZE} players.")

    player_ids = [s["player_id"] for s in selections]
    if len(set(player_ids)) != len(player_ids):
        raise FantasyError("Duplicate players are not allowed in a squad.")

    players = list(Player.objects.filter(id__in=player_ids).select_related("team"))
    if len(players) != len(player_ids):
        raise FantasyError("One or more selected players do not exist.")

    players_by_id = {p.id: p for p in players}

    # Eligibility: player's team must participate in fantasy_team.competition.
    registered_team_ids = set(
        fantasy_team.competition.teams.values_list("id", flat=True)
    )
    for p in players:
        if p.team_id not in registered_team_ids:
            raise FantasyError(
                f"Player {p.id} is not eligible for this competition."
            )

    position_counts = Counter(
        players_by_id[s["player_id"]].position for s in selections
    )
    for position, required in POSITION_REQUIREMENTS.items():
        actual = position_counts.get(position, 0)
        if actual != required:
            raise FantasyError(
                f"Squad requires exactly {required} {position}, got {actual}."
            )

    starters = [s for s in selections if s["is_starter"]]
    bench = [s for s in selections if not s["is_starter"]]
    if len(starters) != STARTERS:
        raise FantasyError(f"Squad requires exactly {STARTERS} starters.")
    if len(bench) != BENCH:
        raise FantasyError(f"Squad requires exactly {BENCH} bench players.")

    captains = [s for s in selections if s.get("is_captain", False)]
    if len(captains) != 1:
        raise FantasyError("Squad requires exactly one captain.")
    if not captains[0]["is_starter"]:
        raise FantasyError("Captain must be a starter.")