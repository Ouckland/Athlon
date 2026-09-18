from collections import Counter
from decimal import Decimal

from django.db import transaction

from league.models import Player

from fantasy.constants import (
    MAX_PLAYER_PRICE,
    MIN_PLAYER_PRICE,
    ZERO,
)
from fantasy.models import (
    FantasyPlayerPrice,
    FantasyPlayerSelection,
    FantasyTeam,
)


class FantasyError(Exception):
    """Raised when a fantasy domain rule is violated."""


SQUAD_SIZE = 15
STARTERS = 11
BENCH = 4
POSITION_REQUIREMENTS = {"GK": 2, "DEF": 5, "MID": 5, "ATT": 3}


# ---------------------------------------------------------------------------
# Prices
# ---------------------------------------------------------------------------
def set_player_price(*, player, price):
    """
    Create or update the fantasy price for a player.

    Validates the price range. Raises FantasyError on invalid input.
    """
    if price is None:
        raise FantasyError("Player price is required.")
    if not isinstance(price, Decimal):
        try:
            price = Decimal(str(price))
        except Exception:
            raise FantasyError("Player price must be a decimal number.")
    if price < MIN_PLAYER_PRICE:
        raise FantasyError(
            f"Player price must be at least {MIN_PLAYER_PRICE}."
        )
    if price > MAX_PLAYER_PRICE:
        raise FantasyError(
            f"Player price must be at most {MAX_PLAYER_PRICE}."
        )
    obj, _ = FantasyPlayerPrice.objects.update_or_create(
        player=player, defaults={"price": price}
    )
    return obj


def get_player_price(player):
    """
    Return the player's fantasy price, or None if no price is set.
    """
    row = FantasyPlayerPrice.objects.filter(player=player).first()
    return row.price if row else None


def squad_total_cost(selections):
    """
    Return the Decimal total cost of a list of FantasyPlayerSelection-like
    objects (each with .player_id). Raises FantasyError if any player has
    no price set.
    """
    player_ids = [s.player_id for s in selections]
    prices = {
        row.player_id: row.price
        for row in FantasyPlayerPrice.objects.filter(player_id__in=player_ids)
    }
    missing = [pid for pid in player_ids if pid not in prices]
    if missing:
        raise FantasyError(
            f"Player(s) {missing} have no fantasy price set."
        )
    return sum(prices[pid] for pid in player_ids)


# ---------------------------------------------------------------------------
# Team creation
# ---------------------------------------------------------------------------
def create_fantasy_team(*, user, name, competition, season):
    if not name or not name.strip():
        raise FantasyError("Fantasy team name is required.")
    if season.competition_id != competition.id:
        raise FantasyError("Season does not belong to this competition.")
    if FantasyTeam.objects.filter(
        user=user, competition=competition, season=season
    ).exists():
        raise FantasyError(
            "You already have a fantasy team in this competition/season."
        )
    return FantasyTeam.objects.create(
        user=user, name=name.strip(), competition=competition, season=season
    )


def validate_player_eligibility(player, competition):
    """
    A player is eligible iff their team participates in the competition.
    """
    return player.team.competitions.filter(id=competition.id).exists()


# ---------------------------------------------------------------------------
# Squad
# ---------------------------------------------------------------------------
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

    players = list(
        Player.objects.filter(id__in=player_ids).select_related("team")
    )
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

    # Position composition.
    position_counts = Counter(
        players_by_id[s["player_id"]].position for s in selections
    )
    for position, required in POSITION_REQUIREMENTS.items():
        actual = position_counts.get(position, 0)
        if actual != required:
            raise FantasyError(
                f"Squad requires exactly {required} {position}, got {actual}."
            )

    # Starters / bench.
    starters = [s for s in selections if s["is_starter"]]
    bench = [s for s in selections if not s["is_starter"]]
    if len(starters) != STARTERS:
        raise FantasyError(f"Squad requires exactly {STARTERS} starters.")
    if len(bench) != BENCH:
        raise FantasyError(f"Squad requires exactly {BENCH} bench players.")

    # Captain.
    captains = [s for s in selections if s.get("is_captain", False)]
    if len(captains) != 1:
        raise FantasyError("Squad requires exactly one captain.")
    if not captains[0]["is_starter"]:
        raise FantasyError("Captain must be a starter.")

    # Budget.
    prices = {
        row.player_id: row.price
        for row in FantasyPlayerPrice.objects.filter(player_id__in=player_ids)
    }
    missing = [pid for pid in player_ids if pid not in prices]
    if missing:
        raise FantasyError(
            f"Player(s) {missing} have no fantasy price set."
        )
    total_cost = sum(prices[pid] for pid in player_ids)
    if total_cost > fantasy_team.starting_budget:
        raise FantasyError(
            f"Squad cost {total_cost} exceeds budget "
            f"{fantasy_team.starting_budget}."
        )