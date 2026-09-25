from django.db import transaction

from matches.models import Match

from fantasy.models import FantasyChipUse, FantasyPlayerSelection
from fantasy.services.teams import (
    FantasyError,
    _validate_squad,
    is_gameweek_locked,
    validate_stage_for_fantasy,
)


def has_chip_been_used(*, fantasy_team, chip_type):
    return FantasyChipUse.objects.filter(
        fantasy_team=fantasy_team,
        season=fantasy_team.season,
        chip_type=chip_type,
    ).exists()


def get_active_chip(*, fantasy_team, stage):
    return FantasyChipUse.objects.filter(
        fantasy_team=fantasy_team, stage=stage
    ).first()


def is_chip_active(*, fantasy_team, stage, chip_type):
    use = get_active_chip(fantasy_team=fantasy_team, stage=stage)
    return use is not None and use.chip_type == chip_type


def _free_hit_used_for_stage(*, fantasy_team, stage):
    return FantasyChipUse.objects.filter(
        fantasy_team=fantasy_team,
        stage=stage,
        chip_type=FantasyChipUse.Chip.FREE_HIT,
    ).exists()


def _stage_finished(stage):
    """
    A gameweek is considered finished when all of its "relevant" matches
    have reached FULL TIME.

    Relevant matches are those NOT in POSTPONED or CANCELLED state. A
    postponed/cancelled match will never reach FINISHED, so requiring it
    would block the stage from ever being marked finished. This matches
    the existing is_gameweek_locked() semantics, which also treats
    POSTPONED/CANCELLED matches as "non-events".

    Edge cases:
      - Stage with zero relevant matches     -> not finished (conservative;
                                                 there is no positive
                                                 evidence the gameweek ran)
      - Stage where every match is
        POSTPONED or CANCELLED               -> not finished (same reason)
      - Stage with a mix of FINISHED and
        POSTPONED/CANCELLED                  -> finished (the postponed
                                                 match is out of scope for
                                                 this gameweek)

    Assumption: every non-postponed, non-cancelled match that is part of a
    played gameweek will eventually be marked FINISHED. This holds for every
    match created through the normal flow.
    """
    relevant = Match.objects.filter(stage=stage).exclude(
        status__in=(Match.Status.POSTPONED, Match.Status.CANCELLED)
    )
    if not relevant.exists():
        return False
    return not relevant.exclude(status=Match.Status.FINISHED).exists()


def get_current_selections(*, fantasy_team, stage):
    """
    The squad currently in force for the stage.

    - Free Hit used AND stage not yet finished → Free Hit rows
    - Otherwise                                → permanent rows
    """
    fh_used = _free_hit_used_for_stage(fantasy_team=fantasy_team, stage=stage)
    if fh_used and not _stage_finished(stage):
        return FantasyPlayerSelection.objects.filter(
            fantasy_team=fantasy_team, stage=stage, is_free_hit=True
        )
    return FantasyPlayerSelection.objects.filter(
        fantasy_team=fantasy_team, stage=stage, is_free_hit=False
    )


def get_scoring_selections(*, fantasy_team, stage):
    """
    The squad that generated the fantasy points for the stage.

    Once Free Hit has been used for a stage, that stage's scoring is always
    based on the Free Hit squad — even after the gameweek finishes. This
    makes historical scoring deterministic and immune to whatever squad
    the user currently has.
    """
    fh_used = _free_hit_used_for_stage(fantasy_team=fantasy_team, stage=stage)
    return FantasyPlayerSelection.objects.filter(
        fantasy_team=fantasy_team, stage=stage, is_free_hit=fh_used
    )


def chip_state_for_team(*, fantasy_team):
    """
    Return a list of dicts describing each chip and whether it has been
    used this season, plus the stage it was used in.
    """
    uses = {
        u.chip_type: u
        for u in FantasyChipUse.objects.filter(
            fantasy_team=fantasy_team, season=fantasy_team.season
        )
    }
    return [
        {
            "chip": chip,
            "used": chip in uses,
            "stage_id": uses[chip].stage_id if chip in uses else None,
        }
        for chip in FantasyChipUse.Chip.values
    ]


def activate_chip(*, fantasy_team, stage, chip_type, selections=None):
    """
    Activate a chip for the given fantasy team and gameweek.

    - WILDCARD / BENCH_BOOST / TRIPLE_CAPTAIN: no squad payload required.
    - FREE_HIT: requires an existing permanent starting squad AND a full
      15-player `selections` payload. Rows are written with
      is_free_hit=True; permanent rows are left untouched.
    """
    if chip_type not in FantasyChipUse.Chip.values:
        raise FantasyError(f"Invalid chip: {chip_type!r}.")

    validate_stage_for_fantasy(fantasy_team=fantasy_team, stage=stage)
    if is_gameweek_locked(stage):
        raise FantasyError(
            "This gameweek is locked; chips can no longer be activated."
        )

    if has_chip_been_used(fantasy_team=fantasy_team, chip_type=chip_type):
        raise FantasyError(f"{chip_type} has already been used this season.")

    if FantasyChipUse.objects.filter(
        fantasy_team=fantasy_team, stage=stage
    ).exists():
        raise FantasyError(
            "A chip has already been activated for this gameweek."
        )

    if chip_type == FantasyChipUse.Chip.FREE_HIT:
        if not FantasyPlayerSelection.objects.filter(
            fantasy_team=fantasy_team, stage=stage, is_free_hit=False
        ).exists():
            raise FantasyError(
                "Free Hit requires an existing starting squad for this gameweek."
            )
        if not selections:
            raise FantasyError(
                "Free Hit requires a full squad ('selections')."
            )
        _validate_squad(fantasy_team, selections)

    with transaction.atomic():
        if chip_type == FantasyChipUse.Chip.FREE_HIT:
            FantasyPlayerSelection.objects.filter(
                fantasy_team=fantasy_team, stage=stage, is_free_hit=True
            ).delete()
            FantasyPlayerSelection.objects.bulk_create(
                [
                    FantasyPlayerSelection(
                        fantasy_team=fantasy_team,
                        stage=stage,
                        player_id=s["player_id"],
                        is_starter=bool(s["is_starter"]),
                        is_captain=bool(s.get("is_captain", False)),
                        is_free_hit=True,
                    )
                    for s in selections
                ]
            )
        use = FantasyChipUse.objects.create(
            fantasy_team=fantasy_team,
            season=fantasy_team.season,
            stage=stage,
            chip_type=chip_type,
        )
    return use