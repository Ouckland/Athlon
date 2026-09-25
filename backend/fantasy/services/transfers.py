from django.db import connection, transaction

from fantasy.constants import FREE_TRANSFER_LIMIT
from fantasy.models import (
    FantasyChipUse,
    FantasyPlayerSelection,
    FantasyTeam,
    FantasyTransfer,
)
from fantasy.services.chips import get_active_chip, get_current_selections
from fantasy.services.teams import (
    FantasyError,
    _validate_squad,
    is_gameweek_locked,
    validate_stage_for_fantasy,
)


def transfers_used(*, fantasy_team, stage):
    """Transfers that consumed the normal allowance. Chip transfers excluded."""
    return FantasyTransfer.objects.filter(
        fantasy_team=fantasy_team,
        stage=stage,
        counts_toward_limit=True,
    ).count()


def transfers_remaining(*, fantasy_team, stage):
    return max(0, FREE_TRANSFER_LIMIT - transfers_used(
        fantasy_team=fantasy_team, stage=stage
    ))


def make_transfer(*, fantasy_team, stage, player_out, player_in):
    validate_stage_for_fantasy(fantasy_team=fantasy_team, stage=stage)
    if is_gameweek_locked(stage):
        raise FantasyError(
            "This gameweek is locked; transfers can no longer be made."
        )
    if player_out.id == player_in.id:
        raise FantasyError("Outgoing and incoming players must be different.")

    active = get_active_chip(fantasy_team=fantasy_team, stage=stage)
    chip_active = active is not None and active.chip_type in (
        FantasyChipUse.Chip.WILDCARD,
        FantasyChipUse.Chip.FREE_HIT,
    )

    with transaction.atomic():
        if connection.features.has_select_for_update:
            FantasyTeam.objects.select_for_update().get(pk=fantasy_team.pk)

        current = list(
            get_current_selections(fantasy_team=fantasy_team, stage=stage)
        )
        if not current:
            raise FantasyError(
                "No starting squad exists for this gameweek. "
                "Create a starting squad first."
            )

        by_player_id = {s.player_id: s for s in current}

        out_selection = by_player_id.get(player_out.id)
        if out_selection is None:
            raise FantasyError(
                "Outgoing player is not in your squad for this gameweek."
            )
        if player_in.id in by_player_id:
            raise FantasyError("Incoming player is already in your squad.")
        if out_selection.is_captain:
            raise FantasyError(
                "You cannot transfer your captain out. "
                "Change your captain first."
            )

        if not chip_active:
            if transfers_used(fantasy_team=fantasy_team, stage=stage) >= FREE_TRANSFER_LIMIT:
                raise FantasyError(
                    f"Transfer limit reached for this gameweek "
                    f"({FREE_TRANSFER_LIMIT} allowed)."
                )

        proposed_payload = []
        for sel in current:
            if sel.player_id == player_out.id:
                proposed_payload.append({
                    "player_id": player_in.id,
                    "is_starter": sel.is_starter,
                    "is_captain": False,
                })
            else:
                proposed_payload.append({
                    "player_id": sel.player_id,
                    "is_starter": sel.is_starter,
                    "is_captain": sel.is_captain,
                })

        _validate_squad(fantasy_team, proposed_payload)

        out_is_starter = out_selection.is_starter
        out_is_fh = out_selection.is_free_hit
        out_selection.delete()
        FantasyPlayerSelection.objects.create(
            fantasy_team=fantasy_team,
            stage=stage,
            player=player_in,
            is_starter=out_is_starter,
            is_captain=False,
            is_free_hit=out_is_fh,
        )
        return FantasyTransfer.objects.create(
            fantasy_team=fantasy_team,
            stage=stage,
            player_out=player_out,
            player_in=player_in,
            counts_toward_limit=not chip_active,
        )