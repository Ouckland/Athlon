from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from league.models import Competition, Organization, Player, Team
from matches.models import Match, MatchEvent
from matches.services import MatchError, create_match, record_match_event


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