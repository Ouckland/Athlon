from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from django.utils import timezone

from league.models import Competition, Organization, Player, Team
from matches.models import Match, MatchEvent
from matches.services import MatchError, create_match, record_match_event
from rest_framework.test import APIClient


from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from config.asgi import application



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class _Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")
        self.competition = Competition.objects.create(
            organization=self.org, name="2026 League", slug="2026-league"
        )
        self.home = Team.objects.create(
            organization=self.org, name="Home FC", slug="home-fc"
        )
        self.away = Team.objects.create(
            organization=self.org, name="Away FC", slug="away-fc"
        )
        self.competition.teams.add(self.home, self.away)

        self.home_player = Player.objects.create(
            team=self.home, first_name="H", position=Player.Position.ATT
        )
        self.away_player = Player.objects.create(
            team=self.away, first_name="A", position=Player.Position.MID
        )

        self.match = create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            kickoff_at=timezone.now(),
        )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class MatchModelTests(_Base):
    def test_defaults(self):
        self.assertEqual(self.match.status, Match.Status.SCHEDULED)
        self.assertEqual(self.match.home_score, 0)
        self.assertEqual(self.match.away_score, 0)
        self.assertIsNone(self.match.minute)

    def test_str(self):
        self.assertEqual(str(self.match), "Home FC vs Away FC")

    def test_home_and_away_must_differ_at_db_level(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Match.objects.create(
                    competition=self.competition,
                    home_team=self.home,
                    away_team=self.home,
                )


class MatchEventModelTests(_Base):
    def test_event_defaults_and_ordering(self):
        e1 = MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_player,
        )
        e2 = MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.YELLOW,
            minute=5,
            team=self.away,
            player=self.away_player,
        )
        events = list(self.match.events.all())
        self.assertEqual(events, [e2, e1])  # ordered by minute

    def test_str(self):
        e = MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=10, team=self.home
        )
        self.assertIn("Goal", str(e))
        self.assertIn("10", str(e))


# ---------------------------------------------------------------------------
# create_match
# ---------------------------------------------------------------------------
class CreateMatchServiceTests(_Base):
    def test_rejects_same_team(self):
        with self.assertRaises(MatchError):
            create_match(
                competition=self.competition,
                home_team=self.home,
                away_team=self.home,
            )

    def test_rejects_team_from_other_org(self):
        other_org = Organization.objects.create(name="Other", slug="other")
        foreign = Team.objects.create(
            organization=other_org, name="Foreign FC", slug="foreign-fc"
        )
        with self.assertRaises(MatchError):
            create_match(
                competition=self.competition,
                home_team=self.home,
                away_team=foreign,
            )

    def test_rejects_team_not_registered_in_competition(self):
        extra = Team.objects.create(
            organization=self.org, name="Extra FC", slug="extra-fc"
        )  # not added to competition.teams
        with self.assertRaises(MatchError):
            create_match(
                competition=self.competition,
                home_team=self.home,
                away_team=extra,
            )

    def test_accepts_valid_teams(self):
        m = create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
        )
        self.assertEqual(m.status, Match.Status.SCHEDULED)
        self.assertEqual(m.competition, self.competition)


# ---------------------------------------------------------------------------
# record_match_event — validation
# ---------------------------------------------------------------------------
class RecordMatchEventValidationTests(_Base):
    def test_rejects_invalid_event_type(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match, event_type="BANANA", minute=5, team=self.home
            )

    def test_rejects_minute_out_of_range(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.GOAL, minute=0,
                team=self.home,
            )
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.GOAL, minute=999,
                team=self.home,
            )

    def test_goal_requires_team(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.GOAL, minute=10
            )

    def test_player_must_belong_to_event_team(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=self.home,
                player=self.away_player,
            )

    def test_substitution_requires_both_players(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.SUBSTITUTION,
                minute=60,
                team=self.home,
                player=self.home_player,
            )

    def test_substitution_rejects_same_player(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.SUBSTITUTION,
                minute=60,
                team=self.home,
                player=self.home_player,
                related_player=self.home_player,
            )

    def test_related_player_only_for_substitutions(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=self.home,
                player=self.home_player,
                related_player=self.away_player,
            )

    def test_team_must_be_in_match(self):
        extra = Team.objects.create(
            organization=self.org, name="Extra FC", slug="extra-fc"
        )
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=extra,
            )

    def test_no_event_is_created_on_validation_failure(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=self.home,
                player=self.away_player,
            )
        self.assertEqual(self.match.events.count(), 0)


# ---------------------------------------------------------------------------
# record_match_event — derived state
# ---------------------------------------------------------------------------
class RecordMatchEventDerivedStateTests(_Base):
    def test_goal_increments_home_score(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.home_score, 1)
        self.assertEqual(self.match.away_score, 0)

    def test_goal_increments_away_score(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=20,
            team=self.away,
            player=self.away_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.home_score, 0)
        self.assertEqual(self.match.away_score, 1)

    def test_multiple_goals_accumulate(self):
        for minute in (5, 30, 70):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=minute,
                team=self.home,
                player=self.home_player,
            )
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=44,
            team=self.away,
            player=self.away_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.home_score, 3)
        self.assertEqual(self.match.away_score, 1)

    def test_yellow_does_not_affect_score(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.YELLOW,
            minute=25,
            team=self.home,
            player=self.home_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.home_score, 0)
        self.assertEqual(self.match.away_score, 0)

    def test_first_event_transitions_scheduled_to_live(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=3,
            team=self.home,
            player=self.home_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.status, Match.Status.LIVE)
        self.assertIsNotNone(self.match.started_at)
        self.assertEqual(self.match.minute, 3)

    def test_halftime_sets_status(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=20,
            team=self.home,
            player=self.home_player,
        )
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.HALFTIME,
            minute=45,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.status, Match.Status.HALFTIME)
        self.assertEqual(self.match.minute, 45)

    def test_fulltime_sets_status_and_finished_at(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.HALFTIME,
            minute=45,
        )
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.FULLTIME,
            minute=90,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.status, Match.Status.FINISHED)
        self.assertIsNotNone(self.match.finished_at)
        self.assertEqual(self.match.minute, 90)

    def test_score_remains_consistent_if_event_deleted(self):
        e = record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_player,
        )
        # Simulate a correction: delete the event, then trigger recalc.
        from matches.services.matches import _recalculate_score

        e.delete()
        _recalculate_score(self.match)
        self.match.refresh_from_db()
        self.assertEqual(self.match.home_score, 0)

# ---------------------------------------------------------------------------
# record_match_event — lifecycle guards
# ---------------------------------------------------------------------------
class RecordMatchEventLifecycleTests(_Base):
    # -- terminal statuses -------------------------------------------------
    def test_rejects_events_on_finished_match(self):
        Match.objects.filter(pk=self.match.pk).update(
            status=Match.Status.FINISHED
        )
        self.match.refresh_from_db()
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=92,
                team=self.home,
                player=self.home_player,
            )
        self.assertEqual(self.match.events.count(), 0)

    def test_rejects_events_on_postponed_match(self):
        Match.objects.filter(pk=self.match.pk).update(
            status=Match.Status.POSTPONED
        )
        self.match.refresh_from_db()
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.YELLOW,
                minute=10,
                team=self.home,
                player=self.home_player,
            )
        self.assertEqual(self.match.events.count(), 0)

    def test_rejects_events_on_cancelled_match(self):
        Match.objects.filter(pk=self.match.pk).update(
            status=Match.Status.CANCELLED
        )
        self.match.refresh_from_db()
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.HALFTIME,
                minute=45,
            )
        self.assertEqual(self.match.events.count(), 0)

    # -- HALFTIME ----------------------------------------------------------
    def test_rejects_duplicate_halftime(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.HALFTIME,
            minute=45,
        )
        self.match.refresh_from_db()
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.HALFTIME,
                minute=46,
            )
        self.assertEqual(
            self.match.events.filter(type=MatchEvent.Type.HALFTIME).count(), 1
        )

    # -- FULLTIME ----------------------------------------------------------
    def test_rejects_fulltime_before_halftime(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.FULLTIME,
                minute=90,
            )
        self.assertEqual(
            self.match.events.filter(type=MatchEvent.Type.FULLTIME).count(), 0
        )

    def test_rejects_duplicate_fulltime(self):
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.HALFTIME, minute=45
        )
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.FULLTIME, minute=90
        )
        self.match.refresh_from_db()
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match,
                event_type=MatchEvent.Type.FULLTIME,
                minute=92,
            )
        self.assertEqual(
            self.match.events.filter(type=MatchEvent.Type.FULLTIME).count(), 1
        )

    # -- positive sanity ---------------------------------------------------
    def test_halftime_then_fulltime_still_allowed(self):
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.HALFTIME, minute=45
        )
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.FULLTIME, minute=90
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.status, Match.Status.FINISHED)
        self.assertEqual(self.match.events.count(), 2)

    def test_goal_after_halftime_still_allowed(self):
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.HALFTIME, minute=45
        )
        # Status is HALFTIME (not terminal), so events remain valid.
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=60,
            team=self.away,
            player=self.away_player,
        )
        self.match.refresh_from_db()
        self.assertEqual(self.match.away_score, 1)

User = get_user_model()


class MatchAPITests(_Base):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="matches-api@example.com", password="StrongPass!23"
        )
        self.list_url = reverse("matches:match-list")

    # ------------------------------------------------------------------
    # Listing
    # ------------------------------------------------------------------
    def test_list_matches_is_public(self):
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["id"], self.match.id)

    def test_list_response_structure(self):
        resp = self.client.get(self.list_url)
        row = resp.data[0]
        for key in (
            "id", "competition", "home_team", "away_team",
            "status", "home_score", "away_score", "minute",
        ):
            self.assertIn(key, row)
        self.assertEqual(set(row["home_team"].keys()), {"id", "name", "short_name"})
        self.assertEqual(set(row["competition"].keys()), {"id", "name", "slug"})

    def test_filter_by_competition(self):
        other_org = Organization.objects.create(name="Other", slug="other")
        other_comp = Competition.objects.create(
            organization=other_org, name="Other Cup", slug="other-cup"
        )
        oh = Team.objects.create(organization=other_org, name="OH", slug="oh")
        oa = Team.objects.create(organization=other_org, name="OA", slug="oa")
        other_comp.teams.add(oh, oa)
        create_match(competition=other_comp, home_team=oh, away_team=oa)

        resp = self.client.get(self.list_url, {"competition": self.competition.id})
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["competition"]["id"], self.competition.id)

    def test_filter_by_team(self):
        resp_home = self.client.get(self.list_url, {"team": self.home.id})
        self.assertEqual(len(resp_home.data), 1)

        resp_away = self.client.get(self.list_url, {"team": self.away.id})
        self.assertEqual(len(resp_away.data), 1)

        outsider = Team.objects.create(
            organization=self.org, name="Outsider", slug="outsider"
        )
        resp_none = self.client.get(self.list_url, {"team": outsider.id})
        self.assertEqual(len(resp_none.data), 0)

    def test_filter_by_status(self):
        Match.objects.filter(pk=self.match.pk).update(status=Match.Status.LIVE)
        live = self.client.get(self.list_url, {"status": "LIVE"})
        self.assertEqual(len(live.data), 1)
        finished = self.client.get(self.list_url, {"status": "FINISHED"})
        self.assertEqual(len(finished.data), 0)

    # ------------------------------------------------------------------
    # Detail
    # ------------------------------------------------------------------
    def test_detail_is_public(self):
        resp = self.client.get(
            reverse("matches:match-detail", args=[self.match.id])
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], self.match.id)
        for key in (
            "kickoff_at", "started_at", "finished_at",
            "created_at", "updated_at", "status_display",
        ):
            self.assertIn(key, resp.data)

    def test_detail_404_for_unknown_match(self):
        resp = self.client.get(reverse("matches:match-detail", args=[999999]))
        self.assertEqual(resp.status_code, 404)

    # ------------------------------------------------------------------
    # Create — match
    # ------------------------------------------------------------------
    def test_create_match_requires_auth(self):
        resp = self.client.post(
            self.list_url,
            {
                "competition_id": self.competition.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_create_match_authenticated(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self.list_url,
            {
                "competition_id": self.competition.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], Match.Status.SCHEDULED)
        self.assertEqual(resp.data["home_team"]["id"], self.home.id)
        self.assertEqual(resp.data["away_team"]["id"], self.away.id)
        self.assertEqual(resp.data["competition"]["id"], self.competition.id)

    def test_create_match_rejects_missing_fields(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(self.list_url, {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_create_match_rejects_same_team(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self.list_url,
            {
                "competition_id": self.competition.id,
                "home_team_id": self.home.id,
                "away_team_id": self.home.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_match_rejects_team_outside_competition(self):
        self.client.force_authenticate(user=self.user)
        outsider = Team.objects.create(
            organization=self.org, name="Outsider", slug="outsider"
        )
        resp = self.client.post(
            self.list_url,
            {
                "competition_id": self.competition.id,
                "home_team_id": self.home.id,
                "away_team_id": outsider.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    # ------------------------------------------------------------------
    # Events — listing
    # ------------------------------------------------------------------
    def test_events_list_is_public(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_player,
        )
        resp = self.client.get(
            reverse("matches:match-events", args=[self.match.id])
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        row = resp.data[0]
        for key in (
            "id", "type", "minute",
            "team", "player", "related_player",
            "description", "created_at",
        ):
            self.assertIn(key, row)
        self.assertEqual(row["type"], "GOAL")
        self.assertEqual(row["team"]["id"], self.home.id)
        self.assertEqual(row["player"]["id"], self.home_player.id)

    # ------------------------------------------------------------------
    # Events — creation
    # ------------------------------------------------------------------
    def _event_url(self):
        return reverse("matches:match-events", args=[self.match.id])

    def test_event_create_requires_auth(self):
        resp = self.client.post(
            self._event_url(),
            {
                "type": "GOAL",
                "minute": 10,
                "team_id": self.home.id,
                "player_id": self.home_player.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_event_create_goal_updates_score(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self._event_url(),
            {
                "type": "GOAL",
                "minute": 10,
                "team_id": self.home.id,
                "player_id": self.home_player.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("event", resp.data)
        self.assertIn("match", resp.data)
        self.assertEqual(resp.data["match"]["home_score"], 1)
        self.assertEqual(resp.data["match"]["away_score"], 0)
        self.assertEqual(resp.data["match"]["status"], Match.Status.LIVE)

    def test_event_create_halftime_then_fulltime_updates_status(self):
        self.client.force_authenticate(user=self.user)

        r1 = self.client.post(
            self._event_url(), {"type": "HALFTIME", "minute": 45}, format="json"
        )
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r1.data["match"]["status"], Match.Status.HALFTIME)

        r2 = self.client.post(
            self._event_url(), {"type": "FULLTIME", "minute": 90}, format="json"
        )
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.data["match"]["status"], Match.Status.FINISHED)
        self.assertIsNotNone(r2.data["match"]["finished_at"])

    def test_event_create_rejects_invalid_type(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self._event_url(),
            {"type": "BANANA", "minute": 10},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_event_create_rejects_missing_minute(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self._event_url(),
            {"type": "GOAL", "team_id": self.home.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_event_create_rejects_service_business_rule_violation(self):
        # GOAL without a team passes the serializer shape but is rejected by
        # the service layer — proving the view surfaces MatchError as 400.
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            self._event_url(),
            {"type": "GOAL", "minute": 10},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)

    def test_event_create_rejects_lifecycle_violation(self):
        self.client.force_authenticate(user=self.user)
        # Full-time the match via service first.
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.HALFTIME, minute=45
        )
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.FULLTIME, minute=90
        )
        self.match.refresh_from_db()

        resp = self.client.post(
            self._event_url(),
            {
                "type": "GOAL",
                "minute": 93,
                "team_id": self.home.id,
                "player_id": self.home_player.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)


# ---------------------------------------------------------------------------
# WebSocket / realtime
# ---------------------------------------------------------------------------
class MatchWebSocketTests(TransactionTestCase):
    """
    Uses TransactionTestCase because the consumer and the test run in different
    execution contexts; TestCase's outer transaction would hide writes from the
    Channels worker thread.
    """

    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org-ws")
        self.competition = Competition.objects.create(
            organization=self.org, name="2026 League", slug="2026-league-ws"
        )
        self.home = Team.objects.create(
            organization=self.org, name="Home FC", slug="home-fc-ws"
        )
        self.away = Team.objects.create(
            organization=self.org, name="Away FC", slug="away-fc-ws"
        )
        self.competition.teams.add(self.home, self.away)

        self.home_player = Player.objects.create(
            team=self.home, first_name="H", position=Player.Position.ATT
        )
        self.away_player = Player.objects.create(
            team=self.away, first_name="A", position=Player.Position.MID
        )

        self.match = create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
        )

    # ------------------------------------------------------------------
    def _ws_url(self, match_id):
        return f"/ws/matches/{match_id}/"

    # ------------------------------------------------------------------
    def test_connect_to_existing_match_receives_initial_state(self):
        async def run():
            comm = WebsocketCommunicator(application, self._ws_url(self.match.id))
            connected, _ = await comm.connect()
            self.assertTrue(connected)

            msg = await comm.receive_json_from()
            self.assertEqual(msg["type"], "match_state")
            self.assertEqual(msg["match"]["id"], self.match.id)
            self.assertEqual(msg["match"]["status"], Match.Status.SCHEDULED)
            self.assertEqual(msg["events"], [])

            await comm.disconnect()

        async_to_sync(run)()

    def test_connect_to_unknown_match_is_rejected(self):
        async def run():
            comm = WebsocketCommunicator(application, self._ws_url(999999))
            connected, _ = await comm.connect()
            self.assertFalse(connected)

        async_to_sync(run)()

    def test_initial_state_includes_existing_events(self):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_player,
        )

        async def run():
            comm = WebsocketCommunicator(application, self._ws_url(self.match.id))
            await comm.connect()
            msg = await comm.receive_json_from()

            self.assertEqual(msg["type"], "match_state")
            self.assertEqual(len(msg["events"]), 1)
            self.assertEqual(msg["events"][0]["type"], "GOAL")
            self.assertEqual(msg["match"]["home_score"], 1)

            await comm.disconnect()

        async_to_sync(run)()

    def test_successful_event_broadcasts_to_connected_client(self):
        async def run():
            comm = WebsocketCommunicator(application, self._ws_url(self.match.id))
            await comm.connect()
            await comm.receive_json_from()  # drain initial state

            # Trigger the real service — this is the exact path the DRF view
            # uses. Run it in a worker thread so it doesn't block the loop.
            await sync_to_async(record_match_event)(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=self.home,
                player=self.home_player,
            )

            msg = await comm.receive_json_from()
            self.assertEqual(msg["type"], "match_event")
            self.assertEqual(msg["event"]["type"], "GOAL")
            self.assertEqual(msg["event"]["player"]["id"], self.home_player.id)
            self.assertEqual(msg["match"]["home_score"], 1)
            self.assertEqual(msg["match"]["status"], Match.Status.LIVE)

            await comm.disconnect()

        async_to_sync(run)()

    def test_clients_on_other_matches_do_not_receive_event(self):
        other_match = create_match(
            competition=self.competition,
            home_team=self.away,
            away_team=self.home,
        )

        async def run():
            comm = WebsocketCommunicator(
                application, self._ws_url(other_match.id)
            )
            await comm.connect()
            await comm.receive_json_from()  # drain initial state

            # Record an event against the FIRST match — the second client
            # must not receive it.
            await sync_to_async(record_match_event)(
                match=self.match,
                event_type=MatchEvent.Type.GOAL,
                minute=10,
                team=self.home,
                player=self.home_player,
            )

            got_nothing = await comm.receive_nothing(timeout=0.3)
            self.assertTrue(got_nothing)

            await comm.disconnect()

        async_to_sync(run)()

        def test_rolled_back_transaction_does_not_broadcast(self):
            """
            event creation wrapped in an outer atomic() block that rolls back
            must NOT produce a WebSocket broadcast, because the broadcast is
            registered via transaction.on_commit().
            """
            async def run():
                comm = WebsocketCommunicator(application, self._ws_url(self.match.id))
                await comm.connect()
                await comm.receive_json_from()  # drain initial match_state

                def _create_then_rollback():
                    from django.db import transaction
                    try:
                        with transaction.atomic():
                            record_match_event(
                                match=self.match,
                                event_type=MatchEvent.Type.GOAL,
                                minute=10,
                                team=self.home,
                                player=self.home_player,
                            )
                            raise RuntimeError("force outer rollback")
                    except RuntimeError:
                        pass

                await sync_to_async(_create_then_rollback)()

                got_nothing = await comm.receive_nothing(timeout=0.5)
                self.assertTrue(
                    got_nothing,
                    "Rolled-back event must not be broadcast to WebSocket clients.",
                )

                # And the DB must have no event either.
                count = await sync_to_async(
                    lambda: MatchEvent.objects.filter(match=self.match).count()
                )()
                self.assertEqual(count, 0)

                await comm.disconnect()

            async_to_sync(run)()
        
    def test_invalid_event_does_not_broadcast(self):
        async def run():
            comm = WebsocketCommunicator(application, self._ws_url(self.match.id))
            await comm.connect()
            await comm.receive_json_from()  # drain initial state

            def _try_invalid():
                try:
                    record_match_event(
                        match=self.match,
                        event_type=MatchEvent.Type.GOAL,
                        minute=10,
                        # no team — service rejects with MatchError
                    )
                except MatchError:
                    return "rejected"
                return "unexpected"

            outcome = await sync_to_async(_try_invalid)()
            self.assertEqual(outcome, "rejected")

            got_nothing = await comm.receive_nothing(timeout=0.3)
            self.assertTrue(got_nothing)

            await comm.disconnect()

        async_to_sync(run)()