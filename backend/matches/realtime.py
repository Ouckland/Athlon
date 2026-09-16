import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Match
from .serializers import MatchEventSerializer, MatchSerializer

logger = logging.getLogger(__name__)


def match_group_name(match_id):
    """Channel group name for a specific match."""
    return f"match_{match_id}"


def broadcast_match_event(event):
    """
    Publish a newly-recorded MatchEvent plus the updated Match state to the
    match's channel group. Called by the matches service after the DB write
    succeeds. Never raises.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    # Refresh with select_related so the serializers don't hit the DB per field.
    match = (
        Match.objects
        .select_related("competition", "home_team", "away_team")
        .get(pk=event.match_id)
    )

    payload = {
        "type": "match_event",
        "event": MatchEventSerializer(event).data,
        "match": MatchSerializer(match).data,
    }

    async_to_sync(channel_layer.group_send)(
        match_group_name(match.id),
        {"type": "match.event", "payload": payload},
    )