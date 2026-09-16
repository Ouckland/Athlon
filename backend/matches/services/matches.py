import logging
from django.db import transaction
from django.utils import timezone

from matches.models import Match, MatchEvent
 


logger = logging.getLogger(__name__)



class MatchError(Exception):
     """Raised when a match domain rule is violated."""
 
 
MIN_MINUTE = 1
MAX_MINUTE = 200

# Match statuses that disallow any further MatchEvent.
TERMINAL_STATUSES = (
    Match.Status.FINISHED,
    Match.Status.POSTPONED,
    Match.Status.CANCELLED,
)

def _validate_lifecycle(*, match, event_type):
    """
    Guard rails that depend on the match's lifecycle rather than the event
    payload itself.

    Rules:
      - no events on a match that is FINISHED, POSTPONED, or CANCELLED
      - HALFTIME may only be recorded once per match
      - FULLTIME may only be recorded once per match
      - FULLTIME cannot be recorded before HALFTIME
    """
    if match.status in TERMINAL_STATUSES:
        raise MatchError(
            f"Cannot record events on a match with status {match.status}."
        )

    if event_type == MatchEvent.Type.HALFTIME:
        if match.events.filter(type=MatchEvent.Type.HALFTIME).exists():
            raise MatchError("HALFTIME has already been recorded for this match.")

    if event_type == MatchEvent.Type.FULLTIME:
        if match.events.filter(type=MatchEvent.Type.FULLTIME).exists():
            raise MatchError("FULLTIME has already been recorded for this match.")
        if not match.events.filter(type=MatchEvent.Type.HALFTIME).exists():
            raise MatchError("FULLTIME cannot be recorded before HALFTIME.")



# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------
def create_match(*, competition, home_team, away_team, kickoff_at=None):
    """
    Create a scheduled Match.

    Rules:
      - home and away must be different teams
      - both teams must belong to the competition's organization
      - both teams must be registered in the competition (Team.competitions M2M)
    """
    if home_team.id == away_team.id:
        raise MatchError("Home and away teams must be different.")

    if home_team.organization_id != competition.organization_id:
        raise MatchError("Home team is not in the competition's organization.")
    if away_team.organization_id != competition.organization_id:
        raise MatchError("Away team is not in the competition's organization.")

    registered_team_ids = set(competition.teams.values_list("id", flat=True))
    if home_team.id not in registered_team_ids:
        raise MatchError("Home team is not registered in this competition.")
    if away_team.id not in registered_team_ids:
        raise MatchError("Away team is not registered in this competition.")

    return Match.objects.create(
        competition=competition,
        home_team=home_team,
        away_team=away_team,
        kickoff_at=kickoff_at,
    )


def _post_commit_side_effects(event):
    """
    Runs once the record_match_event() transaction has committed.

    Order is deliberate:
      1. Fantasy points are recalculated for the match.
      2. The match/event update is broadcast over WebSocket.

    Recalculating first guarantees that by the time a connected client
    receives the live match update, the fantasy points it depends on are
    already persisted.

    Both steps are individually guarded so a failure in one never affects
    the other, and neither can invalidate the committed MatchEvent.
    """
    _safe_recalculate_fantasy(event.match_id)
    _safe_broadcast_event(event)


def _safe_recalculate_fantasy(match_id):
    """
    Recalculate FantasyPoints for `match_id` using the Fantasy scoring
    service as the sole source of truth.

    A local import is used deliberately: `fantasy.services.scoring` imports
    `matches.models`, and `matches.services.matches` is loaded during app
    startup. Keeping the import inside the callback body avoids a module-level
    cycle and also defers the cost until the first committed event.

    Any failure here is logged and swallowed — a broken fantasy layer must
    never break match-event recording.
    """
    try:
        from matches.models import Match
        from fantasy.services.scoring import recalculate_match_points

        match = Match.objects.get(pk=match_id)
        recalculate_match_points(match)
    except Exception:
        logger.exception(
            "Failed to recalculate fantasy points for match %s", match_id
        )


def _safe_broadcast_event(event):
    """
    Broadcast a MatchEvent to WebSocket subscribers.

    Kept separate from fantasy recalculation so a channel-layer failure
    cannot prevent scoring, and vice versa. Any failure is logged and
    swallowed.
    """
    try:
        from matches.realtime import broadcast_match_event

        broadcast_match_event(event)
    except Exception:
        logger.exception(
            "Failed to broadcast MatchEvent %s for match %s",
            event.pk,
            event.match_id,
        )


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
def record_match_event(
    *,
    match,
    event_type,
    minute,
    team=None,
    player=None,
    related_player=None,
    description="",
):
    """
    Validate, persist a MatchEvent, then refresh derived match state
    (score, minute, status).

    All validation happens before any DB write.
    """
    _validate_lifecycle(match=match, event_type=event_type)
    _validate_event(
        match=match,
        event_type=event_type,
        minute=minute,
        team=team,
        player=player,
        related_player=related_player,
    )

    with transaction.atomic():
        event = MatchEvent.objects.create(
            match=match,
            type=event_type,
            minute=minute,
            team=team,
            player=player,
            related_player=related_player,
            description=description or "",
        )

        if event_type == MatchEvent.Type.GOAL:
            _recalculate_score(match)

        _apply_event_to_match(match, event)
    
    # Broadcast only after the DB transaction that wraps this call commits.
    # If an outer transaction rolls back, this callback never fires.
    transaction.on_commit(lambda: _post_commit_side_effects(event))

    return event


def _validate_event(*, match, event_type, minute, team, player, related_player):
    if event_type not in MatchEvent.Type.values:
        raise MatchError(f"Invalid event type: {event_type!r}.")

    if minute is None or not (MIN_MINUTE <= minute <= MAX_MINUTE):
        raise MatchError(f"Minute must be between {MIN_MINUTE} and {MAX_MINUTE}.")

    # Team, when given, must be one of the two sides.
    if team is not None and team.id not in (match.home_team_id, match.away_team_id):
        raise MatchError("Event team must be one of the match teams.")

    # Player must belong to the event's team.
    if player is not None:
        if team is None:
            raise MatchError("Player events require a team.")
        if player.team_id != team.id:
            raise MatchError("Player must belong to the event team.")

    # Event-type specific rules.
    if event_type in (MatchEvent.Type.GOAL, MatchEvent.Type.YELLOW, MatchEvent.Type.RED):
        if team is None:
            raise MatchError(f"{event_type} events require a team.")

    if event_type == MatchEvent.Type.SUBSTITUTION:
        if team is None:
            raise MatchError("Substitution requires a team.")
        if player is None:
            raise MatchError("Substitution requires the player going off.")
        if related_player is None:
            raise MatchError("Substitution requires the player coming on.")
        if related_player.team_id != team.id:
            raise MatchError("Player coming on must belong to the event team.")
        if related_player.id == player.id:
            raise MatchError("A player cannot substitute themselves.")

    # related_player only makes sense for substitutions.
    if related_player is not None and event_type != MatchEvent.Type.SUBSTITUTION:
        raise MatchError("Only substitution events can have a related player.")


# ---------------------------------------------------------------------------
# Derived state
# ---------------------------------------------------------------------------
def _recalculate_score(match):
    """
    Recompute home_score / away_score from GOAL events. Idempotent.
    Saves only if a value actually changed.
    """
    goals_by_home = match.events.filter(
        type=MatchEvent.Type.GOAL, team_id=match.home_team_id
    ).count()
    goals_by_away = match.events.filter(
        type=MatchEvent.Type.GOAL, team_id=match.away_team_id
    ).count()

    updates = []
    if match.home_score != goals_by_home:
        match.home_score = goals_by_home
        updates.append("home_score")
    if match.away_score != goals_by_away:
        match.away_score = goals_by_away
        updates.append("away_score")

    if updates:
        match.save(update_fields=updates + ["updated_at"])
    return match


def _apply_event_to_match(match, event):
    """
    Reflect an event on the parent Match's status/minute/started_at/finished_at.
    Never touches score (that's _recalculate_score's job).
    """
    updates = {"minute": event.minute}

    if event.type == MatchEvent.Type.HALFTIME:
        updates["status"] = Match.Status.HALFTIME
    elif event.type == MatchEvent.Type.FULLTIME:
        updates["status"] = Match.Status.FINISHED
        updates["finished_at"] = timezone.now()
    elif match.status == Match.Status.SCHEDULED:
        # First in-play event kicks the match off.
        updates["status"] = Match.Status.LIVE
        updates["started_at"] = timezone.now()

    for field, value in updates.items():
        setattr(match, field, value)
    match.save(update_fields=list(updates.keys()) + ["updated_at"])