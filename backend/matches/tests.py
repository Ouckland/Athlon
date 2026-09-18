from datetime import timedelta
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from django.utils import timezone

from accounts.models import User

from league.services import add_team_manager

from league.models import Competition, Organization, Season, Stage, Team, Player, TeamManager
from fantasy.models import FantasyPoints
from league.models import TeamManager
from matches.models import Match, MatchEvent, MatchLineup
from matches.services import MatchError, create_match, record_match_event, submit_lineup, get_player_minutes
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
            email="matches-api@example.com",
            password="StrongPass!23",
            role=User.Role.SCOUT,
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
    def test_create_match_forbidden_without_auth(self):
        resp = self.client.post(
            self.list_url,
            {
                "competition_id": self.competition.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

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

    def test_event_create_forbidden_without_auth(self):
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
        self.assertEqual(resp.status_code, 403)
        
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


# ---------------------------------------------------------------------------
# MatchEvent → FantasyPoints integration
# ---------------------------------------------------------------------------
class MatchEventFantasyIntegrationTests(TestCase):
    """
    Verifies that recording a MatchEvent via the matches service triggers a
    FantasyPoints recalculation after the transaction commits.

    Uses captureOnCommitCallbacks(execute=True) because TestCase wraps each
    test in a transaction that never actually commits — without it, the
    on_commit callback would be queued but never run.
    """

    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org-int")
        self.competition = Competition.objects.create(
            organization=self.org, name="League", slug="league-int"
        )
        self.home = Team.objects.create(
            organization=self.org, name="Home", slug="home-int"
        )
        self.away = Team.objects.create(
            organization=self.org, name="Away", slug="away-int"
        )
        self.competition.teams.add(self.home, self.away)

        self.home_att = Player.objects.create(
            team=self.home, first_name="H", position=Player.Position.ATT
        )
        self.away_att = Player.objects.create(
            team=self.away, first_name="A", position=Player.Position.ATT
        )

        self.match = create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
        )

        # Lineup rows so get_player_minutes() returns 90 for the scorers.
        # Without these, score_player_for_match() returns 0 minutes and
        # therefore 0 points — this is the intended Stage 2 design.
        MatchLineup.objects.create(
            match=self.match, team=self.home, player=self.home_att,
            is_starter=True, subbed_off_minute=90,
        )
        MatchLineup.objects.create(
            match=self.match, team=self.away, player=self.away_att,
            is_starter=True, subbed_off_minute=90,
        )
        Match.objects.filter(pk=self.match.pk).update(minute=90)
        self.match.refresh_from_db()

    def _record(self, **kwargs):
        # Wraps each service call so its on_commit callback actually fires.
        with self.captureOnCommitCallbacks(execute=True):
            return record_match_event(match=self.match, **kwargs)

    # ------------------------------------------------------------------
    # Happy paths
    # ------------------------------------------------------------------
    def test_goal_creates_fantasy_points(self):
        self._record(
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_att,
        )
        fp = FantasyPoints.objects.get(match=self.match, player=self.home_att)
        # ATT goal 4 + appearance 1 + 60+ minutes 1 = 6
        self.assertEqual(fp.points, 6)

    def test_away_goal_creates_fantasy_points(self):
        self._record(
            event_type=MatchEvent.Type.GOAL,
            minute=20,
            team=self.away,
            player=self.away_att,
        )
        fp = FantasyPoints.objects.get(match=self.match, player=self.away_att)
        self.assertEqual(fp.points, 6)

    def test_yellow_card_updates_fantasy_points(self):
        self._record(
            event_type=MatchEvent.Type.YELLOW,
            minute=30,
            team=self.home,
            player=self.home_att,
        )
        fp = FantasyPoints.objects.get(match=self.match, player=self.home_att)
        # appearance 1 + 60+ 1 + yellow -1 = 1
        self.assertEqual(fp.points, 1)

    def test_red_card_updates_fantasy_points(self):
        self._record(
            event_type=MatchEvent.Type.RED,
            minute=30,
            team=self.home,
            player=self.home_att,
        )
        fp = FantasyPoints.objects.get(match=self.match, player=self.home_att)
        # appearance 1 + 60+ 1 + red -3 = -1
        self.assertEqual(fp.points, -1)

    def test_multiple_events_accumulate_and_are_idempotent(self):
        self._record(
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_att,
        )
        self._record(
            event_type=MatchEvent.Type.GOAL,
            minute=40,
            team=self.home,
            player=self.home_att,
        )
        fp = FantasyPoints.objects.get(match=self.match, player=self.home_att)
        # 2 * 4 goals + appearance 1 + 60+ 1 = 10
        self.assertEqual(fp.points, 10)

        # Recalculate wipes and re-derives rows, so re-fetch instead of
        # refresh_from_db() — the old instance's pk no longer exists.
        from fantasy.services import recalculate_match_points
        recalculate_match_points(self.match)

        fp = FantasyPoints.objects.get(match=self.match, player=self.home_att)
        self.assertEqual(fp.points, 10)

    def test_event_for_player_with_no_prior_row_creates_one(self):
        # No FantasyPoints row exists for the scorer before the event.
        self.assertFalse(
            FantasyPoints.objects.filter(
                match=self.match, player=self.home_att
            ).exists()
        )

        self._record(
            event_type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.home_att,
        )

        # The scorer now has a row with the expected total.
        fp = FantasyPoints.objects.get(
            match=self.match, player=self.home_att
        )
        # ATT goal 4 + appearance 1 + 60+ 1 = 6
        self.assertEqual(fp.points, 6)

    # ------------------------------------------------------------------
    # Transaction safety
    # ------------------------------------------------------------------
    def test_rolled_back_transaction_does_not_persist_fantasy_points(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                record_match_event(
                    match=self.match,
                    event_type=MatchEvent.Type.GOAL,
                    minute=10,
                    team=self.home,
                    player=self.home_att,
                )
                raise RuntimeError("force outer rollback")

        self.assertEqual(
            MatchEvent.objects.filter(match=self.match).count(), 0
        )
        self.assertEqual(
            FantasyPoints.objects.filter(match=self.match).count(), 0
        )



class MatchAuthorizationTests(_Base):
    """
    MVP authorization for match operational actions.

    - anonymous writes        -> 401
    - authenticated USER      -> 403
    - SCOUT                   -> allowed
    - ADMIN                   -> allowed
    - reads remain public
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        self.plain_user = User.objects.create_user(
            email="plain@example.com",
            password="StrongPass!23",
            role=User.Role.USER,
        )
        self.scout = User.objects.create_user(
            email="scout@example.com",
            password="StrongPass!23",
            role=User.Role.SCOUT,
        )
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="StrongPass!23",
            role=User.Role.ADMIN,
        )

        self.matches_url = reverse("matches:match-list")
        self.events_url = reverse("matches:match-events", args=[self.match.id])

        self.match_payload = {
            "competition_id": self.competition.id,
            "home_team_id": self.home.id,
            "away_team_id": self.away.id,
        }
        self.event_payload = {
            "type": "GOAL",
            "minute": 10,
            "team_id": self.home.id,
            "player_id": self.home_player.id,
        }

    # ------------------------------------------------------------------
    # Match creation
    # ------------------------------------------------------------------
    def test_create_match_anonymous_forbidden(self):
        resp = self.client.post(self.matches_url, self.match_payload, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_create_match_plain_user_403(self):
        self.client.force_authenticate(user=self.plain_user)
        resp = self.client.post(self.matches_url, self.match_payload, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_create_match_scout_201(self):
        self.client.force_authenticate(user=self.scout)
        resp = self.client.post(self.matches_url, self.match_payload, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_create_match_admin_201(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.matches_url, self.match_payload, format="json")
        self.assertEqual(resp.status_code, 201)

    # ------------------------------------------------------------------
    # Event creation
    # ------------------------------------------------------------------
    def test_create_event_anonymous_forbidden(self):
            resp = self.client.post(self.events_url, self.event_payload, format="json")
            self.assertEqual(resp.status_code, 403)

    def test_create_event_plain_user_403(self):
        self.client.force_authenticate(user=self.plain_user)
        resp = self.client.post(self.events_url, self.event_payload, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_create_event_scout_201(self):
        self.client.force_authenticate(user=self.scout)
        resp = self.client.post(self.events_url, self.event_payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["event"]["type"], "GOAL")

    def test_create_event_admin_201(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.events_url, self.event_payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["event"]["type"], "GOAL")

    # ------------------------------------------------------------------
    # Public reads unchanged
    # ------------------------------------------------------------------
    def test_anonymous_can_list_matches(self):
        resp = self.client.get(self.matches_url)
        self.assertEqual(resp.status_code, 200)

    def test_anonymous_can_view_match_detail(self):
        resp = self.client.get(
            reverse("matches:match-detail", args=[self.match.id])
        )
        self.assertEqual(resp.status_code, 200)

    def test_anonymous_can_list_events(self):
        resp = self.client.get(self.events_url)
        self.assertEqual(resp.status_code, 200)


class MatchStageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="scout-mstage@example.com",
            password="StrongPass!23",
            role=User.Role.SCOUT,
        )
        self.org = Organization.objects.create(name="Org", slug="org-mstage")
        self.league = Competition.objects.create(
            organization=self.org, name="L", slug="l-mstage",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.league, name="2026", slug="2026-mstage"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-mstage"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-mstage"
        )
        self.league.teams.add(self.home, self.away)

    # -- service-level validation ---------------------------------------
    def test_match_without_stage_allowed(self):
        m = create_match(
            competition=self.league, home_team=self.home, away_team=self.away,
        )
        self.assertIsNone(m.stage)

    def test_match_with_valid_stage_created(self):
        m = create_match(
            competition=self.league, home_team=self.home, away_team=self.away,
            stage=self.stage,
        )
        self.assertEqual(m.stage, self.stage)

    def test_match_rejects_stage_from_other_competition(self):
        other_league = Competition.objects.create(
            organization=self.org, name="L2", slug="l2-mstage"
        )
        other_season = Season.objects.create(
            competition=other_league, name="2026", slug="2026-other"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(MatchError):
            create_match(
                competition=self.league,
                home_team=self.home,
                away_team=self.away,
                stage=other_stage,
            )

    def test_match_rejects_wrong_stage_kind(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-mstage",
            type=Competition.Type.CUP,
        )
        cup.teams.add(self.home, self.away)
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-cup-mstage"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        with self.assertRaises(MatchError):
            create_match(
                competition=self.league,
                home_team=self.home,
                away_team=self.away,
                stage=round_stage,
            )

    # -- API -------------------------------------------------------------
    def test_match_serializer_exposes_stage(self):
        m = create_match(
            competition=self.league, home_team=self.home, away_team=self.away,
            stage=self.stage,
        )
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(reverse("matches:match-detail", args=[m.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["stage"])
        self.assertEqual(resp.data["stage"]["id"], self.stage.id)
        self.assertEqual(resp.data["stage"]["kind"], "GAMEWEEK")
        self.assertEqual(resp.data["stage"]["number"], 1)

    def test_api_create_match_with_stage_id(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("matches:match-list"),
            {
                "competition_id": self.league.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
                "stage_id": self.stage.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNotNone(resp.data["stage"])
        self.assertEqual(resp.data["stage"]["id"], self.stage.id)

    def test_api_create_match_without_stage_id(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("matches:match-list"),
            {
                "competition_id": self.league.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data["stage"])

    def test_api_create_match_rejects_stage_from_other_competition(self):
        other_league = Competition.objects.create(
            organization=self.org, name="L3", slug="l3-mstage"
        )
        other_season = Season.objects.create(
            competition=other_league, name="2026", slug="2026-l3"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("matches:match-list"),
            {
                "competition_id": self.league.id,
                "home_team_id": self.home.id,
                "away_team_id": self.away.id,
                "stage_id": other_stage.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)


class LineupSubmissionTests(TestCase):
    def setUp(self):
        from accounts.models import User
        from league.models import Competition, Organization, Season, Stage, Team, Player
        self.org = Organization.objects.create(name="O", slug="o-lineup")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-lineup",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-lineup"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-lineup"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-lineup"
        )
        self.competition.teams.add(self.home, self.away)

        self.home_players = [
            Player.objects.create(
                team=self.home, first_name=f"H{i}", position=Player.Position.MID
            ) for i in range(15)
        ]
        self.away_players = [
            Player.objects.create(
                team=self.away, first_name=f"A{i}", position=Player.Position.MID
            ) for i in range(15)
        ]

        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=self.stage,
        )

    def test_valid_lineup_with_bench(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11],
            bench=self.home_players[11:15],
        )
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match, team=self.home).count(), 15
        )
        self.assertEqual(
            MatchLineup.objects.filter(
                match=self.match, team=self.home, is_starter=True
            ).count(), 11
        )

    def test_valid_lineup_without_bench(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11], bench=[],
        )
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match, team=self.home).count(), 11
        )

    def test_wrong_starter_count_rejected(self):
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=self.home,
                starters=self.home_players[:10], bench=[],
            )

        def test_too_many_bench_rejected(self):
            extra = Player.objects.create(
                team=self.home, first_name="ExtraBench", position="MID"
            )
            with self.assertRaises(ValueError):
                submit_lineup(
                    match=self.match, team=self.home,
                    starters=self.home_players[:11],
                    bench=self.home_players[11:15] + [extra],  # 5 bench, over the limit
            )

    def test_duplicate_starters_rejected(self):
        p = self.home_players[0]
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=self.home,
                starters=[p] * 11, bench=[],
            )

    def test_overlap_starter_and_bench_rejected(self):
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=self.home,
                starters=self.home_players[:11],
                bench=[self.home_players[0]],
            )

    def test_player_from_other_team_rejected(self):
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=self.home,
                starters=self.home_players[:10] + [self.away_players[0]],
                bench=[],
            )

    def test_team_not_in_match_rejected(self):
        other = Team.objects.create(
            organization=self.org, name="X", slug="x-lineup"
        )
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=other,
                starters=self.home_players[:11], bench=[],
            )

    def test_lineup_can_be_edited_before_kickoff(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11], bench=[],
        )
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[1:12], bench=[],
        )
        starters = MatchLineup.objects.filter(
            match=self.match, team=self.home, is_starter=True
        ).values_list("player_id", flat=True)
        self.assertIn(self.home_players[11].id, list(starters))

    def test_lineup_rejected_after_kickoff(self):
        Match.objects.filter(pk=self.match.pk).update(status=Match.Status.LIVE)
        self.match.refresh_from_db()
        with self.assertRaises(ValueError):
            submit_lineup(
                match=self.match, team=self.home,
                starters=self.home_players[:11], bench=[],
            )


class LineupSubstitutionTests(TestCase):
    def setUp(self):
        from league.models import (
            Competition, Organization, Player, Season, Stage, Team,
        )
        self.org = Organization.objects.create(name="O", slug="o-sub")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-sub",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-sub"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-sub"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-sub"
        )
        self.competition.teams.add(self.home, self.away)

        positions = ["GK"] * 2 + ["DEF"] * 5 + ["MID"] * 5 + ["ATT"] * 3
        self.home_players = [
            Player.objects.create(
                team=self.home, first_name=f"H{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]
        self.away_players = [
            Player.objects.create(
                team=self.away, first_name=f"A{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]

        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=self.stage,
        )

    def test_substitution_updates_minutes(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11],
            bench=[self.home_players[11]],
        )
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.SUBSTITUTION,
            minute=60, team=self.home,
            player=self.home_players[0], related_player=self.home_players[11],
        )
        off = MatchLineup.objects.get(match=self.match, player=self.home_players[0])
        on = MatchLineup.objects.get(match=self.match, player=self.home_players[11])
        self.assertEqual(off.subbed_off_minute, 60)
        self.assertEqual(on.subbed_on_minute, 60)

    def test_substitution_requires_lineup(self):
        with self.assertRaises(MatchError):
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.SUBSTITUTION,
                minute=60, team=self.home,
                player=self.home_players[0], related_player=self.home_players[11],
            )

        def test_subbed_on_bench_player_then_closed_at_fulltime(self):
            submit_lineup(
                match=self.match, team=self.home,
                starters=self.home_players[:11], bench=[self.home_players[11]],
            )
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.SUBSTITUTION,
                minute=72, team=self.home,
                player=self.home_players[0], related_player=self.home_players[11],
            )
            # FULLTIME requires HALFTIME first — record it to satisfy the lifecycle.
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.HALFTIME, minute=45,
            )
            record_match_event(
                match=self.match, event_type=MatchEvent.Type.FULLTIME, minute=90,
            )
            self.assertEqual(get_player_minutes(self.home_players[11], self.match), 18)
            self.assertEqual(get_player_minutes(self.home_players[0], self.match), 72)
            self.assertEqual(get_player_minutes(self.home_players[12], self.match), 0)


class LineupMinutesTests(TestCase):
    def setUp(self):
        from league.models import (
            Competition, Organization, Player, Season, Stage, Team,
        )
        self.org = Organization.objects.create(name="O", slug="o-min")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-min",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-min"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-min"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-min"
        )
        self.competition.teams.add(self.home, self.away)

        positions = ["GK"] * 2 + ["DEF"] * 5 + ["MID"] * 5 + ["ATT"] * 3
        self.home_players = [
            Player.objects.create(
                team=self.home, first_name=f"H{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]
        self.away_players = [
            Player.objects.create(
                team=self.away, first_name=f"A{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]

        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=self.stage,
        )

    def test_starter_full_match(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11], bench=[],
        )
        Match.objects.filter(pk=self.match.pk).update(minute=90)
        self.match.refresh_from_db()
        self.assertEqual(get_player_minutes(self.home_players[0], self.match), 90)

    def test_starter_subbed_off(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11], bench=[self.home_players[11]],
        )
        record_match_event(
            match=self.match, event_type=MatchEvent.Type.SUBSTITUTION,
            minute=67, team=self.home,
            player=self.home_players[0], related_player=self.home_players[11],
        )
        self.assertEqual(get_player_minutes(self.home_players[0], self.match), 67)

    def test_unused_bench_zero_minutes(self):
        submit_lineup(
            match=self.match, team=self.home,
            starters=self.home_players[:11], bench=[self.home_players[11]],
        )
        self.assertEqual(get_player_minutes(self.home_players[11], self.match), 0)

    def test_no_lineup_zero_minutes(self):
        self.assertEqual(get_player_minutes(self.home_players[0], self.match), 0)


class SubstitutionEdgeCaseTests(TestCase):
    def setUp(self):
        from accounts.models import User
        from league.models import Competition, Organization, Season, Stage, Team, Player
        self.org = Organization.objects.create(name="O", slug="o-subedge")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-subedge",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-subedge"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-subedge"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-subedge"
        )
        self.competition.teams.add(self.home, self.away)

        positions = ["GK"] * 2 + ["DEF"] * 5 + ["MID"] * 5 + ["ATT"] * 3
        self.home_players = [
            Player.objects.create(
                team=self.home, first_name=f"H{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]
        # Away team needs a full 11 for the match to be valid, but for these
        # tests we only submit the home lineup; away stays as-is.
        self.away_players = [
            Player.objects.create(
                team=self.away, first_name=f"A{i}", position=pos
            )
            for i, pos in enumerate(positions)
        ]

        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=self.stage,
        )

        # Submit home lineup: starters = [0..10], bench = [11..14]
        submit_lineup(
            match=self.match,
            team=self.home,
            starters=self.home_players[:11],
            bench=self.home_players[11:15],
        )

    def _sub(self, player_off, player_on, minute):
        record_match_event(
            match=self.match,
            event_type=MatchEvent.Type.SUBSTITUTION,
            minute=minute,
            team=self.home,
            player=player_off,
            related_player=player_on,
        )

    # -- case 1: coming ON must be on the submitted bench -----------------
    def test_sub_on_must_be_in_submitted_lineup(self):
        outsider = Player.objects.create(
            team=self.home, first_name="Outsider", position="MID"
        )
        with self.assertRaises(MatchError):
            self._sub(self.home_players[0], outsider, 60)

    def test_sub_on_must_be_bench_not_another_starter(self):
        # home_players[1] is a starter, not on the bench
        with self.assertRaises(MatchError):
            self._sub(self.home_players[0], self.home_players[1], 60)

    # -- case 2: coming OFF must currently be active ----------------------
    def test_cannot_sub_off_player_already_off(self):
        self._sub(self.home_players[0], self.home_players[11], 60)
        with self.assertRaises(MatchError):
            self._sub(self.home_players[0], self.home_players[12], 70)

    # -- case 3: bench player cannot enter twice --------------------------
    def test_bench_player_cannot_enter_twice(self):
        self._sub(self.home_players[0], self.home_players[11], 60)
        with self.assertRaises(MatchError):
            self._sub(self.home_players[1], self.home_players[11], 70)

class LineupAuthorizationTests(TestCase):
    """
    Phase 3 — lineup submission is authorized via can_manage_team(user, team).
    """

    def setUp(self):
        self.client = APIClient()

        # -- organizations / competition / stage ---------------------------
        self.org = Organization.objects.create(name="Org LA", slug="org-la")
        self.other_org = Organization.objects.create(name="Other LA", slug="other-la")

        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-la",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-la"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )

        # -- teams ---------------------------------------------------------
        # A, B, C all participate in the competition; D does not.
        self.team_a = Team.objects.create(
            organization=self.org, name="A", slug="a-la"
        )
        self.team_b = Team.objects.create(
            organization=self.org, name="B", slug="b-la"
        )
        self.team_c = Team.objects.create(
            organization=self.org, name="C", slug="c-la"
        )
        self.team_d = Team.objects.create(
            organization=self.org, name="D", slug="d-la"
        )
        self.competition.teams.add(self.team_a, self.team_b, self.team_c)

        # -- players (15 each, uniform position is fine for lineup rules) ---
        def make_players(team, n=15):
            return [
                Player.objects.create(
                    team=team, first_name=f"{team.slug}-P{i}", position="MID"
                )
                for i in range(n)
            ]
        self.players_a = make_players(self.team_a)
        self.players_b = make_players(self.team_b)
        self.players_c = make_players(self.team_c)
        self.players_d = make_players(self.team_d)

        # -- match A vs B --------------------------------------------------
        self.match = create_match(
            competition=self.competition,
            home_team=self.team_a, away_team=self.team_b,
            stage=self.stage,
        )

        # -- users ---------------------------------------------------------
        self.admin = User.objects.create_user(
            email="admin-la@example.com", password="StrongPass!23",
            role=User.Role.ADMIN,
        )
        self.superuser = User.objects.create_user(
            email="root-la@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.superuser.is_superuser = True
        self.superuser.save(update_fields=["is_superuser"])

        self.scout = User.objects.create_user(
            email="scout-la@example.com", password="StrongPass!23",
            role=User.Role.SCOUT,
        )
        self.user = User.objects.create_user(
            email="user-la@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.manager_a = User.objects.create_user(
            email="mgr-a@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.manager_c = User.objects.create_user(
            email="mgr-c@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.manager_d = User.objects.create_user(
            email="mgr-d@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )

        add_team_manager(team=self.team_a, user=self.manager_a)
        add_team_manager(team=self.team_c, user=self.manager_c)
        add_team_manager(team=self.team_d, user=self.manager_d)

    # -- helpers ---------------------------------------------------------
    def _url(self, match_id=None, team_id=None):
        return reverse(
            "matches:match-lineup",
            args=[match_id or self.match.id, team_id or self.team_a.id],
        )

    def _payload(self, team, players, starters_count=11, bench_count=0):
        return {
            "team_id": team.id,
            "starters": [p.id for p in players[:starters_count]],
            "bench": [p.id for p in players[starters_count:starters_count + bench_count]],
        }

    def _put(self, url, payload):
        return self.client.put(url, payload, format="json")

    # =====================================================================
    # Authorized
    # =====================================================================
    def test_team_manager_can_submit_lineup(self):
        self.client.force_authenticate(user=self.manager_a)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match, team=self.team_a).count(),
            11,
        )

    def test_team_manager_can_update_lineup(self):
        self.client.force_authenticate(user=self.manager_a)
        self._put(self._url(), self._payload(self.team_a, self.players_a))
        # Swap the XI
        resp = self._put(
            self._url(),
            self._payload(self.team_a, self.players_a[1:], starters_count=11),
        )
        self.assertEqual(resp.status_code, 200)
        ids = set(
            MatchLineup.objects.filter(
                match=self.match, team=self.team_a
            ).values_list("player_id", flat=True)
        )
        self.assertNotIn(self.players_a[0].id, ids)

    def test_admin_can_submit_lineup_for_any_team(self):
        self.client.force_authenticate(user=self.admin)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 200)

    def test_superuser_can_submit_lineup(self):
        self.client.force_authenticate(user=self.superuser)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 200)

    def test_scout_with_team_manager_relationship_can_submit(self):
        add_team_manager(team=self.team_a, user=self.scout)
        self.client.force_authenticate(user=self.scout)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 200)

    # =====================================================================
    # Unauthorized
    # =====================================================================
    def test_normal_user_cannot_submit(self):
        self.client.force_authenticate(user=self.user)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match).count(), 0
        )

    def test_anonymous_cannot_submit(self):
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertIn(resp.status_code, (401, 403))
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match).count(), 0
        )

    def test_scout_without_manager_relationship_cannot_submit(self):
        self.client.force_authenticate(user=self.scout)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 403)

    def test_manager_of_other_team_cannot_submit(self):
        self.client.force_authenticate(user=self.manager_c)
        # team_c is a participating team but is not in the match -> 400
        resp = self._put(
            self._url(team_id=self.team_c.id),
            self._payload(self.team_c, self.players_c),
        )
        self.assertEqual(resp.status_code, 400)

    def test_manager_a_cannot_submit_for_team_b(self):
        # team_b IS in the match (away), but manager_a does not manage it.
        self.client.force_authenticate(user=self.manager_a)
        resp = self._put(
            self._url(team_id=self.team_b.id),
            self._payload(self.team_b, self.players_b),
        )
        self.assertEqual(resp.status_code, 403)

    def test_unassigned_user_cannot_submit(self):
        unassigned = User.objects.create_user(
            email="unassigned-la@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.client.force_authenticate(user=unassigned)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 403)

    # =====================================================================
    # Team / match / competition validation
    # =====================================================================
    def test_team_not_in_match_rejected(self):
        # team_c participates in the competition but isn't playing this match.
        self.client.force_authenticate(user=self.manager_c)
        resp = self._put(
            self._url(team_id=self.team_c.id),
            self._payload(self.team_c, self.players_c),
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)

    def test_team_not_in_competition_rejected(self):
        # Build a match in this competition that references team_d directly
        # via the ORM — bypasses create_match's participation check so we can
        # exercise the view's defensive check.
        weird_match = Match.objects.create(
            competition=self.competition,
            home_team=self.team_d, away_team=self.team_a,
            stage=self.stage,
        )
        self.client.force_authenticate(user=self.manager_d)
        resp = self._put(
            self._url(match_id=weird_match.id, team_id=self.team_d.id),
            self._payload(self.team_d, self.players_d),
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)

    def test_unknown_team_404(self):
        self.client.force_authenticate(user=self.manager_a)
        resp = self._put(
            self._url(team_id=999999),
            self._payload(self.team_a, self.players_a),
        )
        self.assertEqual(resp.status_code, 404)

    def test_unknown_match_404(self):
        self.client.force_authenticate(user=self.manager_a)
        resp = self._put(
            self._url(match_id=999999),
            self._payload(self.team_a, self.players_a),
        )
        self.assertEqual(resp.status_code, 404)

    # =====================================================================
    # Match status locking
    # =====================================================================
    def _set_status(self, status_value):
        Match.objects.filter(pk=self.match.pk).update(status=status_value)
        self.match.refresh_from_db()

    def test_manager_cannot_update_after_kickoff_live(self):
        self.client.force_authenticate(user=self.manager_a)
        self._set_status(Match.Status.LIVE)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 400)

    def test_manager_cannot_update_halftime(self):
        self.client.force_authenticate(user=self.manager_a)
        self._set_status(Match.Status.HALFTIME)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 400)

    def test_manager_cannot_update_finished(self):
        self.client.force_authenticate(user=self.manager_a)
        self._set_status(Match.Status.FINISHED)
        resp = self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.assertEqual(resp.status_code, 400)

    # =====================================================================
    # Data integrity — no mutation on failed auth or validation
    # =====================================================================
    def test_failed_auth_does_not_modify_existing_lineup(self):
        # Build a valid existing lineup as the manager.
        self.client.force_authenticate(user=self.manager_a)
        self._put(self._url(), self._payload(self.team_a, self.players_a))
        before = sorted(
            MatchLineup.objects.filter(match=self.match, team=self.team_a)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(len(before), 11)

        # Now attempt a write as an unrelated user.
        self.client.force_authenticate(user=self.user)
        resp = self._put(
            self._url(),
            self._payload(self.team_a, self.players_a[1:], starters_count=11),
        )
        self.assertEqual(resp.status_code, 403)

        after = sorted(
            MatchLineup.objects.filter(match=self.match, team=self.team_a)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before, after)

    def test_failed_validation_does_not_modify_existing_lineup(self):
        # Valid existing lineup.
        self.client.force_authenticate(user=self.manager_a)
        self._put(self._url(), self._payload(self.team_a, self.players_a))
        before = sorted(
            MatchLineup.objects.filter(match=self.match, team=self.team_a)
            .values_list("player_id", flat=True)
        )

        # Attempt an invalid update (only 10 starters).
        resp = self._put(
            self._url(),
            {
                "team_id": self.team_a.id,
                "starters": [p.id for p in self.players_a[:10]],
                "bench": [],
            },
        )
        self.assertEqual(resp.status_code, 400)

        after = sorted(
            MatchLineup.objects.filter(match=self.match, team=self.team_a)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before, after)

    def test_team_id_in_body_must_match_url(self):
        self.client.force_authenticate(user=self.manager_a)
        payload = self._payload(self.team_a, self.players_a)
        payload["team_id"] = self.team_b.id  # mismatch
        resp = self._put(self._url(team_id=self.team_a.id), payload)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match).count(), 0
        )

    # =====================================================================
    # GET is still public
    # =====================================================================
    def test_get_lineup_is_public(self):
        self.client.force_authenticate(user=self.manager_a)
        self._put(self._url(), self._payload(self.team_a, self.players_a))
        self.client.force_authenticate(user=None)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 11)


class FullFlowIntegrationTests(TestCase):
    """
    End-to-end integration across Stage 3:
    organization -> competition -> season -> stage -> participating teams
    -> team manager -> match -> lineup -> event -> fantasy points.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Org FF", slug="org-ff")
        self.competition = Competition.objects.create(
            organization=self.org, name="League FF", slug="league-ff",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-ff"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )

        self.team_a = Team.objects.create(
            organization=self.org, name="A", slug="a-ff"
        )
        self.team_b = Team.objects.create(
            organization=self.org, name="B", slug="b-ff"
        )
        # Competition participation
        self.competition.teams.add(self.team_a, self.team_b)

        def make_players(team):
            return [
                Player.objects.create(
                    team=team, first_name=f"{team.slug}-P{i}", position="MID"
                )
                for i in range(15)
            ]

        self.players_a = make_players(self.team_a)
        self.players_b = make_players(self.team_b)

        self.admin = User.objects.create_user(
            email="admin-ff@example.com", password="StrongPass!23",
            role=User.Role.ADMIN,
        )
        self.manager_a = User.objects.create_user(
            email="mgr-ff@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        self.scout = User.objects.create_user(
            email="scout-ff@example.com", password="StrongPass!23",
            role=User.Role.SCOUT,
        )

        # Admin assigns manager_a to team_a (Phase 2 flow)
        add_team_manager(team=self.team_a, user=self.manager_a)

        # Match (Phase 1 flow already ensured teams are participants)
        self.match = create_match(
            competition=self.competition,
            home_team=self.team_a, away_team=self.team_b,
            stage=self.stage,
        )

    def _lineup_url(self, match_id=None, team_id=None):
        return reverse(
            "matches:match-lineup",
            args=[match_id or self.match.id, team_id or self.team_a.id],
        )

    def _events_url(self):
        return reverse("matches:match-events", args=[self.match.id])

    # ------------------------------------------------------------------
    def test_full_flow_manager_submits_lineup_scout_records_event(self):
        # 1. Manager submits lineup
        self.client.force_authenticate(user=self.manager_a)
        resp = self.client.put(
            self._lineup_url(),
            {
                "team_id": self.team_a.id,
                "starters": [p.id for p in self.players_a[:11]],
                "bench": [p.id for p in self.players_a[11:15]],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            MatchLineup.objects.filter(match=self.match, team=self.team_a).count(),
            15,
        )

        # 2. Scout records a goal (SCOUT permission is event-recording, not
        #    lineup management — that distinction is being verified here).
        self.client.force_authenticate(user=self.scout)
        with self.captureOnCommitCallbacks(execute=True):
            event_resp = self.client.post(
                self._events_url(),
                {
                    "type": "GOAL",
                    "minute": 10,
                    "team_id": self.team_a.id,
                    "player_id": self.players_a[0].id,
                },
                format="json",
            )
        self.assertEqual(event_resp.status_code, 201)
        self.assertEqual(event_resp.data["match"]["home_score"], 1)

        # 3. Fantasy points recalculated for all lineup participants.
        self.assertEqual(
            FantasyPoints.objects.filter(
                match=self.match, player__team=self.team_a
            ).count(),
            15,
        )

        # 4. Match is now LIVE, so the lineup is locked.
        self.match.refresh_from_db()
        self.assertEqual(self.match.status, Match.Status.LIVE)

        # 5. Manager cannot update lineup now.
        self.client.force_authenticate(user=self.manager_a)
        resp = self.client.put(
            self._lineup_url(),
            {
                "team_id": self.team_a.id,
                "starters": [p.id for p in self.players_a[1:12]],
                "bench": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    # ------------------------------------------------------------------
    def test_scout_cannot_assign_self_as_team_manager(self):
        self.client.force_authenticate(user=self.scout)
        resp = self.client.post(
            reverse("league:team-managers", args=[self.team_a.id]),
            {"user_id": self.scout.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(
            TeamManager.objects.filter(team=self.team_a, user=self.scout).exists()
        )

    # ------------------------------------------------------------------
    def test_team_manager_cannot_add_team_to_competition(self):
        new_team = Team.objects.create(
            organization=self.org, name="C", slug="c-ff"
        )
        self.client.force_authenticate(user=self.manager_a)
        resp = self.client.post(
            reverse("league:competition-teams", args=[self.competition.id]),
            {"team_id": new_team.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(
            self.competition.teams.filter(id=new_team.id).exists()
        )

    # ------------------------------------------------------------------
    def test_lineup_rejected_for_non_participating_team(self):
        # Rogue team and rogue manager bypass Phase 1's participation rule by
        # creating the Match directly (not via create_match).
        rogue = Team.objects.create(
            organization=self.org, name="Rogue", slug="rogue-ff"
        )
        rogue_players = [
            Player.objects.create(
                team=rogue, first_name=f"R{i}", position="MID"
            )
            for i in range(15)
        ]
        rogue_manager = User.objects.create_user(
            email="rogue-ff@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )
        add_team_manager(team=rogue, user=rogue_manager)

        bad_match = Match.objects.create(
            competition=self.competition,
            home_team=rogue, away_team=self.team_a,
            stage=self.stage,
        )

        self.client.force_authenticate(user=rogue_manager)
        resp = self.client.put(
            reverse("matches:match-lineup", args=[bad_match.id, rogue.id]),
            {
                "team_id": rogue.id,
                "starters": [p.id for p in rogue_players[:11]],
                "bench": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(
            MatchLineup.objects.filter(match=bad_match).count(), 0
        )
class LineupViewSingleDefinitionTests(TestCase):
    """
    Regression: match_lineup_view used to be defined twice in views.py.
    This test confirms the view behaves per the canonical (auth-first)
    implementation.
    """

    def setUp(self):
        from accounts.models import User
        from league.models import (
            Competition, Organization, Player, Season, Stage, Team,
        )
        from league.services import add_team_manager

        self.org = Organization.objects.create(name="O", slug="o-single")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-single",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-single"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-single"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-single"
        )
        self.competition.teams.add(self.home, self.away)

        self.players = [
            Player.objects.create(
                team=self.home, first_name=f"P{i}", position="MID"
            )
            for i in range(15)
        ]
        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=self.stage,
        )
        self.stranger = User.objects.create_user(
            email="stranger-single@example.com", password="StrongPass!23",
            role=User.Role.USER,
        )

    def test_unauthorized_put_returns_403_before_400(self):
        # Team is in the match, so a 400-before-403 implementation would
        # not trigger either way. Use a team *not* in the match to prove
        # authorization runs first.
        other = Team.objects.create(
            organization=self.org, name="Other", slug="other-single"
        )
        self.competition.teams.add(other)
        client = APIClient()
        client.force_authenticate(user=self.stranger)
        resp = client.put(
            reverse("matches:match-lineup", args=[self.match.id, other.id]),
            {"team_id": other.id, "starters": [], "bench": []},
            format="json",
        )
        # Auth gate fails first -> 403, not 400.
        self.assertEqual(resp.status_code, 403)

    def test_get_is_public(self):
        client = APIClient()
        resp = client.get(
            reverse("matches:match-lineup", args=[self.match.id, self.home.id])
        )
        self.assertEqual(resp.status_code, 200)


from channels.testing import WebsocketCommunicator
from config.asgi import application


class MatchWebSocketRoutingTests(TransactionTestCase):
    """
    Confirms the WebSocket route is wired through config.asgi and that the
    consumer accepts a public connection to an existing match.
    """

    def setUp(self):
        from league.models import Competition, Organization, Team
        self.org = Organization.objects.create(name="O", slug="o-ws")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-ws",
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-ws"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-ws"
        )
        self.competition.teams.add(self.home, self.away)
        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
        )

    def test_public_connection_receives_initial_state(self):
        async def run():
            comm = WebsocketCommunicator(application, f"/ws/matches/{self.match.id}/")
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            msg = await comm.receive_json_from()
            self.assertEqual(msg["type"], "match_state")
            self.assertEqual(msg["match"]["id"], self.match.id)
            self.assertEqual(msg["events"], [])
            await comm.disconnect()

        async_to_sync(run)()

    def test_unknown_match_closes(self):
        async def run():
            comm = WebsocketCommunicator(application, "/ws/matches/999999/")
            connected, _ = await comm.connect()
            self.assertFalse(connected)

        async_to_sync(run)()


class PublicMatchesAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="O", slug="o-pub")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-pub",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026-pub"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1,
            name="Gameweek 1",
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-pub"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-pub"
        )
        self.competition.teams.add(self.home, self.away)

    def _make_match(self, kickoff_offset_days=0, status_value=Match.Status.SCHEDULED):
        now_local = timezone.localtime(timezone.now())
        base = now_local.replace(hour=15, minute=0, second=0, microsecond=0)
        kickoff = base + timedelta(days=kickoff_offset_days)
        return Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
            kickoff_at=kickoff,
            status=status_value,
        )

    def _url(self):
        return reverse("matches-public:public-matches")

    # -- access -----------------------------------------------------------
    def test_anonymous_can_access(self):
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)

    def test_authenticated_can_access(self):
        from accounts.models import User
        u = User.objects.create_user(email="u-pub@example.com", password="StrongPass!23")
        self.client.force_authenticate(user=u)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)

    # -- response shape ---------------------------------------------------
    def test_response_shape(self):
        self._make_match(kickoff_offset_days=0)
        resp = self.client.get(self._url(), {"date": "today"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        row = resp.data["results"][0]
        for field in (
            "id", "competition", "stage", "home_team", "away_team",
            "kickoff_at", "status", "minute", "home_score", "away_score",
        ):
            self.assertIn(field, row)
        self.assertIn("id", row["competition"])
        self.assertIn("name", row["competition"])
        self.assertIn("id", row["home_team"])
        self.assertIn("name", row["home_team"])
        self.assertIn("id", row["away_team"])

    # -- today ------------------------------------------------------------
    def test_today_includes_today(self):
        self._make_match(kickoff_offset_days=0)
        resp = self.client.get(self._url(), {"date": "today"})
        self.assertEqual(resp.data["count"], 1)

    def test_today_excludes_yesterday(self):
        self._make_match(kickoff_offset_days=-1)
        resp = self.client.get(self._url(), {"date": "today"})
        self.assertEqual(resp.data["count"], 0)

    def test_today_excludes_tomorrow(self):
        self._make_match(kickoff_offset_days=1)
        resp = self.client.get(self._url(), {"date": "today"})
        self.assertEqual(resp.data["count"], 0)

    def test_today_excludes_cancelled_and_postponed(self):
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.CANCELLED)
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.POSTPONED)
        resp = self.client.get(self._url(), {"date": "today"})
        self.assertEqual(resp.data["count"], 0)

    # -- tomorrow ---------------------------------------------------------
    def test_tomorrow_includes_tomorrow(self):
        self._make_match(kickoff_offset_days=1)
        resp = self.client.get(self._url(), {"date": "tomorrow"})
        self.assertEqual(resp.data["count"], 1)

    def test_tomorrow_excludes_today(self):
        self._make_match(kickoff_offset_days=0)
        resp = self.client.get(self._url(), {"date": "tomorrow"})
        self.assertEqual(resp.data["count"], 0)

    # -- week -------------------------------------------------------------
    def test_week_includes_day_zero_through_six(self):
        for offset in range(7):
            self._make_match(kickoff_offset_days=offset)
        resp = self.client.get(self._url(), {"date": "week"})
        self.assertEqual(resp.data["count"], 7)

    def test_week_excludes_day_seven(self):
        self._make_match(kickoff_offset_days=7)
        resp = self.client.get(self._url(), {"date": "week"})
        self.assertEqual(resp.data["count"], 0)

    def test_week_excludes_yesterday(self):
        self._make_match(kickoff_offset_days=-1)
        resp = self.client.get(self._url(), {"date": "week"})
        self.assertEqual(resp.data["count"], 0)

    # -- live -------------------------------------------------------------
    def test_status_live_includes_live_and_halftime(self):
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.LIVE)
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.HALFTIME)
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.SCHEDULED)
        resp = self.client.get(self._url(), {"status": "LIVE"})
        self.assertEqual(resp.data["count"], 2)
        statuses = {r["status"] for r in resp.data["results"]}
        self.assertEqual(statuses, {"LIVE", "HALFTIME"})

    def test_status_live_returns_live_regardless_of_date(self):
        # A LIVE match whose kickoff was yesterday (long match, delayed update)
        # should still appear under status=LIVE.
        self._make_match(kickoff_offset_days=-1, status_value=Match.Status.LIVE)
        resp = self.client.get(self._url(), {"status": "LIVE"})
        self.assertEqual(resp.data["count"], 1)

    def test_status_finished_explicit(self):
        self._make_match(kickoff_offset_days=0, status_value=Match.Status.FINISHED)
        resp = self.client.get(self._url(), {"status": "FINISHED"})
        self.assertEqual(resp.data["count"], 1)

    # -- validation -------------------------------------------------------
    def test_invalid_date_rejected(self):
        resp = self.client.get(self._url(), {"date": "nextmonth"})
        self.assertEqual(resp.status_code, 400)

    def test_invalid_status_rejected(self):
        resp = self.client.get(self._url(), {"status": "NOPE"})
        self.assertEqual(resp.status_code, 400)

    # -- no filters -------------------------------------------------------
    def test_no_filters_returns_all(self):
        self._make_match(kickoff_offset_days=0)
        self._make_match(kickoff_offset_days=5)
        self._make_match(kickoff_offset_days=-3)
        resp = self.client.get(self._url())
        self.assertEqual(resp.data["count"], 3)


class ExistingMatchesAPIRegressionTests(TestCase):
    """Confirm the pre-existing /api/matches/ endpoints are unchanged."""

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="O", slug="o-reg")
        self.competition = Competition.objects.create(
            organization=self.org, name="L", slug="l-reg",
        )
        self.home = Team.objects.create(
            organization=self.org, name="H", slug="h-reg"
        )
        self.away = Team.objects.create(
            organization=self.org, name="A", slug="a-reg"
        )
        self.competition.teams.add(self.home, self.away)
        self.match = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
        )

    def test_authenticated_match_list_still_works(self):
        resp = self.client.get(reverse("matches:match-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_match_detail_still_works(self):
        resp = self.client.get(reverse("matches:match-detail", args=[self.match.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], self.match.id)