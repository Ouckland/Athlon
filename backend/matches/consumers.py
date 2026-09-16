import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Match
from .realtime import match_group_name
from .serializers import MatchEventSerializer, MatchSerializer


class MatchConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for a single match.

    - On connect: validates the match exists, joins the match group, and sends
      the current match state plus all existing events.
    - On disconnect: leaves the group.
    - On any broadcast of type "match.event": forwards the payload to the client.

    This consumer NEVER writes to the database. Event creation stays in the
    HTTP + service-layer path.
    """

    async def connect(self):
        self.match_id = self.scope["url_route"]["kwargs"]["match_id"]
        self.group_name = match_group_name(self.match_id)

        if not await self._match_exists(self.match_id):
            # Reject the handshake for unknown matches.
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        payload = await self._build_initial_state(self.match_id)
        await self.send(text_data=json.dumps(payload))

    async def disconnect(self, code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    # Handler for group_send({"type": "match.event", ...})
    async def match_event(self, message):
        await self.send(text_data=json.dumps(message["payload"]))

    # ------------------------------------------------------------------
    @database_sync_to_async
    def _match_exists(self, match_id):
        return Match.objects.filter(pk=match_id).exists()

    @database_sync_to_async
    def _build_initial_state(self, match_id):
        match = (
            Match.objects
            .select_related("competition", "home_team", "away_team")
            .get(pk=match_id)
        )
        events = (
            match.events
            .select_related("team", "player", "related_player")
            .order_by("minute", "created_at")
        )
        return {
            "type": "match_state",
            "match": MatchSerializer(match).data,
            "events": MatchEventSerializer(events, many=True).data,
        }