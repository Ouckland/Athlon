from django.db import connection, transaction

from fantasy.constants import FREE_TRANSFER_LIMIT
from fantasy.models import (
    FantasyPlayerSelection,
    FantasyTeam,
    FantasyTransfer,
)
from fantasy.services.teams import (
    FantasyError,
    _validate_squad,
    is_gameweek_locked,
    validate_stage_for_fantasy,
)


def transfers_used(*, fantasy_team, stage):
    """Number of transfers already made by `fantasy_team` in `stage`."""
    return FantasyTransfer.objects.filter(
        fantasy_team=fantasy_team, stage=stage
    ).count()


def transfers_remaining(*, fantasy_team, stage):
    """Free transfers still available for `stage`."""
    return max(0, FREE_TRANSFER_LIMIT - transfers_used(
        fantasy_team=fantasy_team, stage=stage
    ))


def make_transfer(*, fantasy_team, stage, player_out, player_in):
    """
    Perform a single transfer for `fantasy_team` in `stage`.

    Validation runs before any DB mutation. The whole mutation (selection
    replace + transfer record creation) is atomic.

    Rules enforced:
      - stage is a valid GAMEWEEK for the fantasy team
      - gameweek is not locked
      - player_out is in the squad for this gameweek
      - player_in is not already in the squad
      - player_out is not the captain
      - transfer limit has not been reached
      - the resulting squad still passes all squad rules
        (composition, prices, budget, captain, eligibility)

    Returns the created FantasyTransfer.
    """
    # Fast pre-checks that don't need the lock.
    validate_stage_for_fantasy(fantasy_team=fantasy_team, stage=stage)
    if is_gameweek_locked(stage):
        raise FantasyError(
            "This gameweek is locked; transfers can no longer be made."
        )
    if player_out.id == player_in.id:
        raise FantasyError(
            "Outgoing and incoming players must be different."
        )

    with transaction.atomic():
        # Serialize concurrent transfers for the same fantasy team.
        if connection.features.has_select_for_update:
            FantasyTeam.objects.select_for_update().get(pk=fantasy_team.pk)

        current = list(
            FantasyPlayerSelection.objects.filter(
                fantasy_team=fantasy_team, stage=stage
            )
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

        if transfers_used(fantasy_team=fantasy_team, stage=stage) >= FREE_TRANSFER_LIMIT:
            raise FantasyError(
                f"Transfer limit reached for this gameweek "
                f"({FREE_TRANSFER_LIMIT} allowed)."
            )

        # Build the proposed squad in memory. Same slot for the new player.
        proposed_payload = []
        for sel in current:
            if sel.player_id == player_out.id:
                proposed_payload.append(
                    {
                        "player_id": player_in.id,
                        "is_starter": sel.is_starter,
                        "is_captain": False,  # captain-out is rejected above
                    }
                )
            else:
                proposed_payload.append(
                    {
                        "player_id": sel.player_id,
                        "is_starter": sel.is_starter,
                        "is_captain": sel.is_captain,
                    }
                )

        # Reuse the existing squad validator — one source of truth for
        # composition, prices, budget, captain, eligibility.
        _validate_squad(fantasy_team, proposed_payload)

        # Only now do we touch the DB.
        out_is_starter = out_selection.is_starter
        out_selection.delete()
        FantasyPlayerSelection.objects.create(
            fantasy_team=fantasy_team,
            stage=stage,
            player=player_in,
            is_starter=out_is_starter,
            is_captain=False,
        )
        transfer = FantasyTransfer.objects.create(
            fantasy_team=fantasy_team,
            stage=stage,
            player_out=player_out,
            player_in=player_in,
        )
        return transfer