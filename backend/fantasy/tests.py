from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from league.models import Competition, Organization, Player, Season, Stage, Team
from matches.models import Match, MatchEvent, MatchLineup
from matches.services import create_match
from matches.services.lineup import submit_lineup

from .constants import DEFAULT_STARTING_BUDGET, MAX_PLAYER_PRICE
from .models import (
    FantasyGroupMembership,
    FantasyPlayerPrice,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
    FantasyTransfer,
)
from .services import (
    BENCH,
    CAPTAIN_MULTIPLIER,
    SCORING_RULES,
    SQUAD_SIZE,
    STARTERS,
    FantasyError,
    calculate_match_points,
    create_fantasy_team,
    create_group,
    create_starting_squad,
    fantasy_team_total_points,
    get_gameweek_points,
    get_player_price,
    group_stage_leaderboard,
    is_gameweek_locked,
    join_group,
    leave_group,
    make_transfer,
    recalculate_match_points,
    remove_group_member,
    score_player_for_match,
    season_leaderboard,
    set_player_price,
    squad_total_cost,
    stage_leaderboard,
    transfers_remaining,
    transfers_used,
    validate_player_eligibility,
)

User = get_user_model()

POSITIONS_15 = ["GK"] * 2 + ["DEF"] * 5 + ["MID"] * 5 + ["ATT"] * 3


# ---------------------------------------------------------------------------
# Base fixtures
# ---------------------------------------------------------------------------
class FantasyTestBase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")
        self.competition = Competition.objects.create(
            organization=self.org,
            name="League",
            slug="league",
            type=Competition.Type.LEAGUE,
        )
        self.season = Season.objects.create(
            competition=self.competition, name="2026", slug="2026"
        )
        self.stage = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        self.home = Team.objects.create(organization=self.org, name="Home", slug="home")
        self.away = Team.objects.create(organization=self.org, name="Away", slug="away")
        self.competition.teams.add(self.home, self.away)

        self.match = create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
        )

        self.user = User.objects.create_user(
            email="fan@example.com", password="StrongPass!23", role=User.Role.USER
        )

    # -- helpers ---------------------------------------------------------
    def _player(self, team, position, name="P", shirt=None, price=Decimal("5.0")):
        player = Player.objects.create(
            team=team,
            first_name=name,
            position=position,
            shirt_number=shirt,
        )
        if price is not None:
            FantasyPlayerPrice.objects.create(player=player, price=price)
        return player

    def _make_valid_squad(self, team=None):
        team = team or self.home
        players = {
            "GK": [self._player(team, "GK", f"GK{i}") for i in range(2)],
            "DEF": [self._player(team, "DEF", f"DEF{i}") for i in range(5)],
            "MID": [self._player(team, "MID", f"MID{i}") for i in range(5)],
            "ATT": [self._player(team, "ATT", f"ATT{i}") for i in range(3)],
        }
        flat = [p for ps in players.values() for p in ps]
        selections = [
            {
                "player_id": p.id,
                "is_starter": i < STARTERS,
                "is_captain": i == 0,
            }
            for i, p in enumerate(flat)
        ]
        return flat, selections

    def _make_team(self, user=None, name="T", competition=None, season=None):
        return create_fantasy_team(
            user=user or self.user,
            name=name,
            competition=competition or self.competition,
            season=season or self.season,
        )


# ---------------------------------------------------------------------------
# Multi-team scoping
# ---------------------------------------------------------------------------
class MultiTeamTests(FantasyTestBase):
    def test_user_can_have_two_teams_in_different_competitions(self):
        comp_b = Competition.objects.create(
            organization=self.org, name="League B", slug="league-b",
            type=Competition.Type.LEAGUE,
        )
        season_b = Season.objects.create(
            competition=comp_b, name="2026", slug="2026-b"
        )
        t1 = self._make_team(name="A", competition=self.competition, season=self.season)
        t2 = self._make_team(name="B", competition=comp_b, season=season_b)
        self.assertEqual(FantasyTeam.objects.filter(user=self.user).count(), 2)
        self.assertNotEqual(t1.id, t2.id)

    def test_duplicate_team_same_competition_season_rejected(self):
        self._make_team(name="A")
        with self.assertRaises(FantasyError):
            self._make_team(name="B")

    def test_same_user_two_seasons_same_competition(self):
        season2 = Season.objects.create(
            competition=self.competition, name="2027", slug="2027"
        )
        self._make_team(name="A", season=self.season)
        self._make_team(name="B", season=season2)
        self.assertEqual(FantasyTeam.objects.filter(user=self.user).count(), 2)

    def test_season_must_belong_to_competition(self):
        other_comp = Competition.objects.create(
            organization=self.org, name="Other", slug="other"
        )
        with self.assertRaises(FantasyError):
            create_fantasy_team(
                user=self.user, name="X",
                competition=other_comp, season=self.season,
            )


# ---------------------------------------------------------------------------
# Squad validation
# ---------------------------------------------------------------------------
class SquadValidationTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="My Team")
        self.players, self.valid = self._make_valid_squad()

    def test_valid_squad_accepted(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        sels = self.team.selections.filter(stage=self.stage)
        self.assertEqual(sels.count(), SQUAD_SIZE)
        self.assertEqual(sels.filter(is_starter=True).count(), STARTERS)
        self.assertEqual(sels.filter(is_starter=False).count(), BENCH)
        self.assertEqual(sels.filter(is_captain=True).count(), 1)

    def test_wrong_total_count_rejected(self):
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid[:-1])

    def test_wrong_gk_count_rejected(self):
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        bad = [s for s in self.valid if s["player_id"] != self.players[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_wrong_def_count_rejected(self):
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        defs = [p for p in self.players if p.position == "DEF"]
        bad = [s for s in self.valid if s["player_id"] != defs[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_wrong_mid_count_rejected(self):
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        mids = [p for p in self.players if p.position == "MID"]
        bad = [s for s in self.valid if s["player_id"] != mids[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_wrong_att_count_rejected(self):
        extra_def = self._player(self.home, "DEF", "ExtraDEF")
        atts = [p for p in self.players if p.position == "ATT"]
        bad = [s for s in self.valid if s["player_id"] != atts[0].id]
        bad.append({"player_id": extra_def.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_wrong_starter_count_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[0]["is_starter"] = False
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_wrong_bench_count_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[-1]["is_starter"] = True
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_no_captain_rejected(self):
        bad = [{**s, "is_captain": False} for s in self.valid]
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_multiple_captains_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[1]["is_captain"] = True
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_captain_on_bench_rejected(self):
        bad = [dict(s) for s in self.valid]
        for s in bad:
            s["is_captain"] = False
        bench_sel = next(s for s in bad if not s["is_starter"])
        bench_sel["is_captain"] = True
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_duplicate_player_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[-1]["player_id"] = bad[0]["player_id"]
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_ineligible_player_rejected(self):
        other_org = Organization.objects.create(name="OtherOrg", slug="other-org")
        other_comp = Competition.objects.create(
            organization=other_org, name="OtherComp", slug="other-comp"
        )
        other_team = Team.objects.create(
            organization=other_org, name="OtherTeam", slug="other-team"
        )
        other_comp.teams.add(other_team)
        outsider = Player.objects.create(
            team=other_team, first_name="Outsider", position="MID"
        )
        bad = [dict(s) for s in self.valid]
        bad[-1]["player_id"] = outsider.id
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=bad)

    def test_stage_from_other_season_rejected(self):
        season2 = Season.objects.create(
            competition=self.competition, name="2027", slug="2027"
        )
        stage2 = Stage.objects.create(
            season=season2, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=stage2, selections=self.valid)

    def test_duplicate_starting_squad_rejected(self):
        # Phase 4.5: a starting squad can only be created once per gameweek.
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        self.assertEqual(self.team.selections.filter(stage=self.stage).count(), SQUAD_SIZE)
        with self.assertRaises(FantasyError):
            create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)

    def test_two_stages_coexist(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        create_starting_squad(fantasy_team=self.team, stage=stage2, selections=self.valid)
        self.assertEqual(self.team.selections.filter(stage=self.stage).count(), SQUAD_SIZE)
        self.assertEqual(self.team.selections.filter(stage=stage2).count(), SQUAD_SIZE)

    def test_player_uniqueness_enforced_at_db(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FantasyPlayerSelection.objects.create(
                    fantasy_team=self.team,
                    stage=self.stage,
                    player=self.players[0],
                    is_starter=False,
                )


# ---------------------------------------------------------------------------
# Eligibility service helper
# ---------------------------------------------------------------------------
class EligibilityTests(FantasyTestBase):
    def test_player_in_competition_eligible(self):
        p = self._player(self.home, "MID", "M")
        self.assertTrue(validate_player_eligibility(p, self.competition))

    def test_player_outside_competition_not_eligible(self):
        other_org = Organization.objects.create(name="OO", slug="oo")
        other_comp = Competition.objects.create(
            organization=other_org, name="OC", slug="oc"
        )
        other_team = Team.objects.create(organization=other_org, name="OT", slug="ot")
        other_comp.teams.add(other_team)
        p = Player.objects.create(team=other_team, first_name="X", position="MID")
        self.assertFalse(validate_player_eligibility(p, self.competition))


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
class ScoringTestBase(FantasyTestBase):
    """
    Scoring is derived from submitted lineups. Tests build lineup rows
    directly so minutes are deterministic and independent of the lineup
    service's SCHEDULED-only rule.

    Layout of POSITIONS_15:
      0-1 GK, 2-6 DEF, 7-11 MID, 12-14 ATT.
    """

    STARTER_IX = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12]  # 2 GK, 5 DEF, 3 MID, 1 ATT
    BENCH_IX = [10, 11, 13, 14]                       # 2 MID, 2 ATT

    def setUp(self):
        super().setUp()
        self.home_players = [
            self._player(self.home, pos, f"H{i}")
            for i, pos in enumerate(POSITIONS_15)
        ]
        self.away_players = [
            self._player(self.away, pos, f"A{i}")
            for i, pos in enumerate(POSITIONS_15)
        ]

        for i in self.STARTER_IX:
            MatchLineup.objects.create(
                match=self.match, team=self.home, player=self.home_players[i],
                is_starter=True, subbed_off_minute=90,
            )
            MatchLineup.objects.create(
                match=self.match, team=self.away, player=self.away_players[i],
                is_starter=True, subbed_off_minute=90,
            )

        for order, i in enumerate(self.BENCH_IX):
            MatchLineup.objects.create(
                match=self.match, team=self.home, player=self.home_players[i],
                is_starter=False, bench_order=order,
            )
            MatchLineup.objects.create(
                match=self.match, team=self.away, player=self.away_players[i],
                is_starter=False, bench_order=order,
            )

        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE,
        )
        self.match.refresh_from_db()

    def _goal(self, player, team, minute=10, assister=None):
        return MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=minute,
            team=team, player=player, related_player=assister,
        )

    def _card(self, player, team, card_type, minute=20):
        return MatchEvent.objects.create(
            match=self.match, type=card_type, minute=minute,
            team=team, player=player,
        )

    def _set_minutes(self, player, minutes):
        MatchLineup.objects.filter(match=self.match, player=player).update(
            subbed_off_minute=minutes
        )


class ScoringTests(ScoringTestBase):
    # -- no participation -------------------------------------------------
    def test_no_lineup_zero_points(self):
        outsider = self._player(self.home, "ATT", "Ghost")
        points, breakdown = score_player_for_match(outsider, self.match)
        self.assertEqual(points, 0)
        self.assertEqual(breakdown, {})

    def test_bench_player_unused_zero_points(self):
        bench = self.home_players[11]
        points, _ = score_player_for_match(bench, self.match)
        self.assertEqual(points, 0)

    def test_starter_with_no_events_gets_appearance_and_60plus(self):
        # MID starter — avoids the GK/DEF clean-sheet bonus.
        p = self.home_players[7]
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["appearance"], 1)
        self.assertIn("minutes_60_plus", breakdown)
        self.assertEqual(points, 2)

    def test_appearance_awarded_with_any_event(self):
        p = self.home_players[7]  # MID starter
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=30)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["appearance"], 1)
        # appearance 1 + yellow -1 + 60+ 1 = 1
        self.assertEqual(points, 1)

    def test_calculate_match_points_creates_rows_for_all_starters(self):
        # All lineup participants get a FantasyPoints row — starters and
        # bench. Bench entries stay at 0 points but the row exists.
        # 15 lineup rows per team × 2 teams = 30.
        written = calculate_match_points(self.match)
        self.assertEqual(len(written), 30)

    # -- goals by position ------------------------------------------------
    def test_goal_by_gk(self):
        p = self.home_players[0]  # GK
        self._goal(p, self.home)
        # Break clean sheet
        self._goal(self.away_players[10], self.away, minute=20)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_GK"] + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_def(self):
        p = self.home_players[2]  # first DEF
        self._goal(p, self.home)
        self._goal(self.away_players[10], self.away, minute=20)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_DEF"] + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_mid(self):
        p = self.home_players[7]  # first MID
        self._goal(p, self.home)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_MID"] + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_att(self):
        p = self.home_players[12]  # first ATT
        self._goal(p, self.home)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_ATT"] + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    # -- cards ------------------------------------------------------------
    def test_yellow_card_negative(self):
        p = self.home_players[7]  # MID
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=30)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["yellow_cards"], -1)
        self.assertEqual(points, 1)  # appearance + yellow + 60+

    def test_red_card_negative(self):
        p = self.home_players[2]  # DEF
        self._card(p, self.home, MatchEvent.Type.RED, minute=30)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["red_cards"], -3)

    def test_multiple_events_accumulate(self):
        p = self.home_players[12]  # ATT
        self._goal(p, self.home, minute=10)
        self._goal(p, self.home, minute=40)
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=60)
        points, _ = score_player_for_match(p, self.match)
        # 2*4 + app 1 + 60+ 1 - yellow 1 = 9
        self.assertEqual(points, 9)

    # -- assists ----------------------------------------------------------
    def test_assist_by_teammate(self):
        scorer = self.home_players[12]
        assister = self.home_players[7]
        self._goal(scorer, self.home, assister=assister)
        _, breakdown = score_player_for_match(assister, self.match)
        self.assertEqual(breakdown["assists"], SCORING_RULES["assist"])

    def test_multiple_assists(self):
        assister = self.home_players[7]
        self._goal(self.home_players[12], self.home, minute=10, assister=assister)
        self._goal(self.home_players[13], self.home, minute=40, assister=assister)
        _, breakdown = score_player_for_match(assister, self.match)
        self.assertEqual(breakdown["assists"], 2 * SCORING_RULES["assist"])

    # -- clean sheet ------------------------------------------------------
    def test_clean_sheet_for_gk(self):
        p = self.home_players[0]
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["clean_sheet"], SCORING_RULES["clean_sheet"])
        # app 1 + 60+ 1 + cs 4 - yellow 1 = 5
        self.assertEqual(points, 5)

    def test_clean_sheet_requires_60_minutes(self):
        p = self.home_players[0]
        self._set_minutes(p, 55)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)

    def test_no_clean_sheet_when_conceded(self):
        p = self.home_players[0]
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        self._goal(self.away_players[12], self.away, minute=20)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)

    def test_no_clean_sheet_after_red_card(self):
        p = self.home_players[2]  # DEF
        self._card(p, self.home, MatchEvent.Type.RED, minute=30)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)

    def test_clean_sheet_only_for_gk_def(self):
        p = self.home_players[7]  # MID
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)

    # -- minutes ----------------------------------------------------------
    def test_subbed_off_before_60_no_minutes_bonus(self):
        p = self.home_players[5]
        self._set_minutes(p, 55)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("minutes_60_plus", breakdown)
        self.assertIn("appearance", breakdown)

    def test_exactly_60_minutes_gets_bonus(self):
        p = self.home_players[5]
        self._set_minutes(p, 60)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertIn("minutes_60_plus", breakdown)

    def test_59_minutes_no_bonus(self):
        p = self.home_players[5]
        self._set_minutes(p, 59)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("minutes_60_plus", breakdown)

    def test_bench_player_who_enters_gets_points(self):
        bench = self.home_players[11]
        MatchLineup.objects.filter(match=self.match, player=bench).update(
            subbed_on_minute=72, subbed_off_minute=90,
        )
        points, breakdown = score_player_for_match(bench, self.match)
        self.assertEqual(points, 1)  # appearance only, no 60+
        self.assertIn("appearance", breakdown)
        self.assertNotIn("minutes_60_plus", breakdown)

    def test_bench_player_plays_60plus_gets_bonus(self):
        bench = self.home_players[11]
        MatchLineup.objects.filter(match=self.match, player=bench).update(
            subbed_on_minute=20, subbed_off_minute=90,
        )
        _, breakdown = score_player_for_match(bench, self.match)
        self.assertIn("minutes_60_plus", breakdown)

    # -- persistence ------------------------------------------------------
    def test_calculate_match_points_scopes_to_lineup_plus_events(self):
        outsider = self._player(self.home, "ATT", "Unrelated")
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=15,
            team=self.home, player=outsider,
        )
        calculate_match_points(self.match)
        self.assertTrue(
            FantasyPoints.objects.filter(match=self.match, player=outsider).exists()
        )

    def test_recalculate_is_deterministic(self):
        p = self.home_players[12]
        self._goal(p, self.home)
        calculate_match_points(self.match)
        first = FantasyPoints.objects.get(match=self.match, player=p).points
        recalculate_match_points(self.match)
        second = FantasyPoints.objects.get(match=self.match, player=p).points
        self.assertEqual(first, second)

    def test_recalculate_clears_stale_rows(self):
        p = self.home_players[12]
        event = self._goal(p, self.home)
        calculate_match_points(self.match)
        self.assertTrue(
            FantasyPoints.objects.filter(match=self.match, player=p).exists()
        )
        event.delete()
        # The player is still in the lineup, so they keep appearance + 60+.
        recalculate_match_points(self.match)
        fp = FantasyPoints.objects.get(match=self.match, player=p)
        self.assertEqual(fp.points, 2)  # appearance + 60+


# ---------------------------------------------------------------------------
# Integration: lineup → events → fantasy points
# ---------------------------------------------------------------------------
class LineupDrivenScoringTests(FantasyTestBase):
    def test_calculate_match_points_includes_lineup_participants(self):
        home_players = [
            self._player(self.home, pos, f"H{i}")
            for i, pos in enumerate(POSITIONS_15)
        ]
        submit_lineup(
            match=self.match, team=self.home,
            starters=home_players[:11], bench=home_players[11:15],
        )
        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE,
        )
        self.match.refresh_from_db()

        calculate_match_points(self.match)
        self.assertEqual(
            FantasyPoints.objects.filter(match=self.match).count(), 15
        )
        for p in home_players[:11]:
            fp = FantasyPoints.objects.get(match=self.match, player=p)
            self.assertGreaterEqual(fp.points, 2)


# ---------------------------------------------------------------------------
# Leaderboard — stage and season scoping
# ---------------------------------------------------------------------------
class LeaderboardTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="Alpha")
        self.players, self.valid = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=self.valid
        )

        for p in self.players[:11]:
            MatchLineup.objects.create(
                match=self.match, team=self.home, player=p,
                is_starter=True, subbed_off_minute=90,
            )
        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE,
        )
        self.match.refresh_from_db()

        self.scorer = self.players[0]
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=10,
            team=self.home, player=self.scorer,
        )
        calculate_match_points(self.match)

    def test_stage_leaderboard_includes_team(self):
        rows = stage_leaderboard(
            competition=self.competition, season=self.season, stage=self.stage,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fantasy_team"].id, self.team.id)
        self.assertGreater(rows[0]["total_points"], 0)

    def test_season_leaderboard_includes_team(self):
        rows = season_leaderboard(competition=self.competition, season=self.season)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fantasy_team"].id, self.team.id)

    def test_captain_points_are_doubled(self):
        base = FantasyPoints.objects.get(
            match=self.match, player=self.scorer
        ).points
        total = fantasy_team_total_points(self.team, stage=self.stage)
        non_captain_total = sum(
            FantasyPoints.objects.get(match=self.match, player=p).points
            for p in self.players[1:11]
        )
        self.assertEqual(total, base * CAPTAIN_MULTIPLIER + non_captain_total)

    def test_bench_players_do_not_contribute(self):
        bench_player = self.players[STARTERS]
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=40,
            team=self.home, player=bench_player,
        )
        recalculate_match_points(self.match)

        before = fantasy_team_total_points(self.team, stage=self.stage)
        MatchEvent.objects.filter(
            match=self.match, player=bench_player
        ).delete()
        recalculate_match_points(self.match)
        after = fantasy_team_total_points(self.team, stage=self.stage)
        self.assertEqual(before, after)


class StageScopingTests(FantasyTestBase):
    def test_points_do_not_leak_across_stages(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        match2 = create_match(
            competition=self.competition,
            home_team=self.home, away_team=self.away,
            stage=stage2,
        )
        players = [
            self._player(self.home, pos, f"H{i}")
            for i, pos in enumerate(POSITIONS_15)
        ]
        MatchLineup.objects.create(
            match=self.match, team=self.home, player=players[0],
            is_starter=True, subbed_off_minute=90,
        )
        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE
        )
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=10,
            team=self.home, player=players[0],
        )
        calculate_match_points(self.match)

        team = self._make_team(name="T")
        selections = [
            {"player_id": p.id, "is_starter": i < 11, "is_captain": i == 0}
            for i, p in enumerate(players)
        ]
        create_starting_squad(fantasy_team=team, stage=stage2, selections=selections)

        s2_rows = stage_leaderboard(
            competition=self.competition, season=self.season, stage=stage2,
        )
        self.assertEqual(s2_rows[0]["total_points"], 0)

    def test_points_do_not_leak_across_seasons(self):
        season2 = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-lk"
        )
        stage2 = Stage.objects.create(
            season=season2, kind=Stage.Kind.GAMEWEEK, number=1
        )
        team2 = self._make_team(name="S2", season=season2)
        _, selections = self._make_valid_squad()
        create_starting_squad(fantasy_team=team2, stage=stage2, selections=selections)

        players = [Player.objects.get(pk=s["player_id"]) for s in selections]
        for p in players[:11]:
            MatchLineup.objects.create(
                match=self.match, team=self.home, player=p,
                is_starter=True, subbed_off_minute=90,
            )
        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE
        )
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=10,
            team=self.home, player=players[0],
        )
        calculate_match_points(self.match)

        rows = season_leaderboard(competition=self.competition, season=season2)
        self.assertEqual(rows[0]["total_points"], 0)


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
class GroupTests(FantasyTestBase):
    def test_create_group_adds_owner_as_member(self):
        group = create_group(owner=self.user, name="Fam")
        self.assertEqual(group.owner, self.user)
        self.assertEqual(len(group.invite_code), 8)
        self.assertTrue(
            FantasyGroupMembership.objects.filter(
                group=group, user=self.user
            ).exists()
        )

    def test_invite_codes_are_unique(self):
        codes = set()
        for i in range(5):
            u = User.objects.create_user(
                email=f"u{i}@example.com", password="StrongPass!23"
            )
            g = create_group(owner=u, name=f"G{i}")
            codes.add(g.invite_code)
        self.assertEqual(len(codes), 5)

    def test_join_group_with_valid_code(self):
        joiner = User.objects.create_user(
            email="joiner@example.com", password="StrongPass!23"
        )
        group = create_group(owner=self.user, name="Crew")
        m = join_group(user=joiner, invite_code=group.invite_code)
        self.assertEqual(m.group, group)
        self.assertEqual(m.user, joiner)

    def test_duplicate_membership_rejected(self):
        group = create_group(owner=self.user, name="Crew")
        with self.assertRaises(FantasyError):
            join_group(user=self.user, invite_code=group.invite_code)

    def test_invalid_invite_code_rejected(self):
        with self.assertRaises(FantasyError):
            join_group(user=self.user, invite_code="NOPE1234")


class GroupManagementTests(FantasyTestBase):
    def test_owner_cannot_leave(self):
        group = create_group(owner=self.user, name="G")
        with self.assertRaises(FantasyError):
            leave_group(user=self.user, group=group)

    def test_member_can_leave(self):
        group = create_group(owner=self.user, name="G")
        joiner = User.objects.create_user(
            email="j@example.com", password="StrongPass!23"
        )
        join_group(user=joiner, invite_code=group.invite_code)
        leave_group(user=joiner, group=group)
        self.assertFalse(
            FantasyGroupMembership.objects.filter(
                group=group, user=joiner
            ).exists()
        )

    def test_owner_can_remove_member(self):
        group = create_group(owner=self.user, name="G")
        joiner = User.objects.create_user(
            email="j2@example.com", password="StrongPass!23"
        )
        join_group(user=joiner, invite_code=group.invite_code)
        remove_group_member(owner=self.user, group=group, member_user=joiner)
        self.assertFalse(
            FantasyGroupMembership.objects.filter(
                group=group, user=joiner
            ).exists()
        )

    def test_non_owner_cannot_remove(self):
        group = create_group(owner=self.user, name="G")
        intruder = User.objects.create_user(
            email="in@example.com", password="StrongPass!23"
        )
        victim = User.objects.create_user(
            email="v@example.com", password="StrongPass!23"
        )
        join_group(user=intruder, invite_code=group.invite_code)
        join_group(user=victim, invite_code=group.invite_code)
        with self.assertRaises(FantasyError):
            remove_group_member(owner=intruder, group=group, member_user=victim)

    def test_owner_cannot_remove_self(self):
        group = create_group(owner=self.user, name="G")
        with self.assertRaises(FantasyError):
            remove_group_member(owner=self.user, group=group, member_user=self.user)

    def test_group_stage_leaderboard_scoped_to_members(self):
        owner_team = self._make_team(name="Owner")
        players, selections = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=owner_team, stage=self.stage, selections=selections
        )

        for p in players[:11]:
            MatchLineup.objects.create(
                match=self.match, team=self.home, player=p,
                is_starter=True, subbed_off_minute=90,
            )
        Match.objects.filter(pk=self.match.pk).update(
            minute=90, status=Match.Status.LIVE
        )
        MatchEvent.objects.create(
            match=self.match, type=MatchEvent.Type.GOAL, minute=10,
            team=self.home, player=players[0],
        )
        calculate_match_points(self.match)

        outsider = User.objects.create_user(
            email="outsider@example.com", password="StrongPass!23"
        )
        outsider_team = self._make_team(user=outsider, name="Outsider")
        _, selections2 = self._make_valid_squad(team=self.away)
        create_starting_squad(
            fantasy_team=outsider_team, stage=self.stage, selections=selections2
        )

        group = create_group(owner=self.user, name="Crew")
        rows = group_stage_leaderboard(
            group=group, competition=self.competition,
            season=self.season, stage=self.stage,
        )
        team_ids = {r["fantasy_team"].id for r in rows}
        self.assertIn(owner_team.id, team_ids)
        self.assertNotIn(outsider_team.id, team_ids)


# ---------------------------------------------------------------------------
# API base
# ---------------------------------------------------------------------------
class FantasyAPITestBase(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class FantasyTeamAPITests(FantasyAPITestBase):
    def _team_list_url(self):
        return reverse("fantasy:team-list")

    def _team_detail_url(self, team_id):
        return reverse("fantasy:team-detail", args=[team_id])

    def _squad_url(self, team_id, stage_id):
        return reverse("fantasy:team-squad", args=[team_id, stage_id])

    def _starting_squad_url(self, team_id, stage_id):
        return reverse(
            "fantasy:team-starting-squad", args=[team_id, stage_id]
        )

    # -- auth -------------------------------------------------------------
    def test_anonymous_cannot_list_teams(self):
        anon = APIClient()
        resp = anon.get(self._team_list_url())
        self.assertIn(resp.status_code, (401, 403))

    def test_anonymous_cannot_create_team(self):
        anon = APIClient()
        resp = anon.post(
            self._team_list_url(),
            {"name": "X", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        self.assertIn(resp.status_code, (401, 403))

    # -- list / create ----------------------------------------------------
    def test_list_my_teams_empty(self):
        resp = self.client.get(self._team_list_url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_create_team(self):
        resp = self.client.post(
            self._team_list_url(),
            {"name": "My Team", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "My Team")
        self.assertEqual(resp.data["competition"]["id"], self.competition.id)
        self.assertEqual(resp.data["season"]["id"], self.season.id)

    def test_create_duplicate_team_rejected(self):
        self.client.post(
            self._team_list_url(),
            {"name": "A", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        resp = self.client.post(
            self._team_list_url(),
            {"name": "B", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_user_can_have_two_teams_across_competitions(self):
        comp_b = Competition.objects.create(
            organization=self.org, name="B", slug="b-api"
        )
        season_b = Season.objects.create(
            competition=comp_b, name="2026", slug="2026-b-api"
        )
        self.client.post(
            self._team_list_url(),
            {"name": "A", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        self.client.post(
            self._team_list_url(),
            {"name": "B", "competition_id": comp_b.id, "season_id": season_b.id},
            format="json",
        )
        resp = self.client.get(self._team_list_url())
        self.assertEqual(len(resp.data), 2)

    # -- detail / update --------------------------------------------------
    def test_patch_team_name(self):
        resp = self.client.post(
            self._team_list_url(),
            {"name": "Old", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        resp = self.client.patch(
            self._team_detail_url(tid), {"name": "New"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "New")

    def test_other_users_team_404(self):
        other = User.objects.create_user(
            email="other@example.com", password="StrongPass!23"
        )
        team = self._make_team(user=other, name="NotMine")
        resp = self.client.get(self._team_detail_url(team.id))
        self.assertEqual(resp.status_code, 404)

    # -- squad via API ----------------------------------------------------
    def test_post_valid_starting_squad(self):
        resp = self.client.post(
            self._team_list_url(),
            {"name": "T", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        players, selections = self._make_valid_squad()
        resp = self.client.post(
            self._starting_squad_url(tid, self.stage.id),
            {"selections": selections}, format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["starters"]), STARTERS)
        self.assertEqual(len(resp.data["bench"]), BENCH)
        self.assertEqual(resp.data["captain_id"], players[0].id)

    def test_post_invalid_starting_squad_rejected(self):
        resp = self.client.post(
            self._team_list_url(),
            {"name": "T", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        _, selections = self._make_valid_squad()
        resp = self.client.post(
            self._starting_squad_url(tid, self.stage.id),
            {"selections": selections[:-1]}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_starting_squad_stage_outside_team_season_rejected(self):
        resp = self.client.post(
            self._team_list_url(),
            {"name": "T", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        season2 = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-sq"
        )
        stage2 = Stage.objects.create(
            season=season2, kind=Stage.Kind.GAMEWEEK, number=1
        )
        _, selections = self._make_valid_squad()
        resp = self.client.post(
            self._starting_squad_url(tid, stage2.id),
            {"selections": selections}, format="json",
        )
        self.assertEqual(resp.status_code, 400)


class StartingSquadAPITests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.team = self._make_team(name="T")
        self.url = reverse(
            "fantasy:team-starting-squad",
            args=[self.team.id, self.stage.id],
        )

    # -- success ----------------------------------------------------------
    def test_create_starting_squad(self):
        _, selections = self._make_valid_squad()
        resp = self.client.post(
            self.url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["starters"]), 11)
        self.assertEqual(len(resp.data["bench"]), 4)
        self.assertIsNotNone(resp.data["captain_id"])
        self.assertEqual(
            self.team.selections.filter(stage=self.stage).count(), 15
        )

    def test_starting_squad_does_not_consume_transfer(self):
        _, selections = self._make_valid_squad()
        self.client.post(self.url, {"selections": selections}, format="json")
        self.assertEqual(
            transfers_used(fantasy_team=self.team, stage=self.stage), 0
        )

    # -- duplicate --------------------------------------------------------
    def test_duplicate_starting_squad_rejected(self):
        _, selections = self._make_valid_squad()
        self.client.post(self.url, {"selections": selections}, format="json")
        before = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        resp = self.client.post(
            self.url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        after = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before, after)

    def test_duplicate_attempt_leaves_existing_unchanged(self):
        _, selections = self._make_valid_squad()
        self.client.post(self.url, {"selections": selections}, format="json")
        before_ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )

        _, other = self._make_valid_squad(team=self.away)
        resp = self.client.post(
            self.url, {"selections": other}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        after_ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before_ids, after_ids)

    # -- auth -------------------------------------------------------------
    def test_anonymous_rejected(self):
        _, selections = self._make_valid_squad()
        anon = APIClient()
        resp = anon.post(
            self.url, {"selections": selections}, format="json"
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_non_owner_rejected(self):
        _, selections = self._make_valid_squad()
        other = User.objects.create_user(
            email="other-p45@example.com", password="StrongPass!23"
        )
        c = APIClient()
        c.force_authenticate(user=other)
        resp = c.post(self.url, {"selections": selections}, format="json")
        self.assertEqual(resp.status_code, 404)

    # -- validation -------------------------------------------------------
    def test_invalid_composition_rejected(self):
        _, selections = self._make_valid_squad()
        resp = self.client.post(
            self.url, {"selections": selections[:-1]}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_missing_captain_rejected(self):
        _, selections = self._make_valid_squad()
        for s in selections:
            s["is_captain"] = False
        resp = self.client.post(
            self.url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_round_stage_rejected(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-p45",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-p45"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        _, selections = self._make_valid_squad()
        url = reverse(
            "fantasy:team-starting-squad",
            args=[self.team.id, round_stage.id],
        )
        resp = self.client.post(
            url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_locked_gameweek_rejected(self):
        Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
            kickoff_at=timezone.now() - timedelta(minutes=10),
            status=Match.Status.LIVE,
        )
        _, selections = self._make_valid_squad()
        resp = self.client.post(
            self.url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    # -- historical integrity --------------------------------------------
    def test_historical_gameweek_retains_its_squad(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        _, gw1_squad = self._make_valid_squad()
        self.client.post(
            self.url, {"selections": gw1_squad}, format="json"
        )

        _, gw2_squad = self._make_valid_squad(team=self.away)
        url2 = reverse(
            "fantasy:team-starting-squad",
            args=[self.team.id, stage2.id],
        )
        self.client.post(
            url2, {"selections": gw2_squad}, format="json"
        )

        gw1_ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        gw2_ids = set(
            self.team.selections.filter(stage=stage2)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(len(gw1_ids), 15)
        self.assertEqual(len(gw2_ids), 15)
        self.assertNotEqual(gw1_ids, gw2_ids)


class SquadReadOnlyTests(FantasyTestBase):
    """
    The old PUT-squad path must be gone; GET must still work.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.team = self._make_team(name="T")
        _, selections = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=selections
        )
        self.url = reverse(
            "fantasy:team-squad", args=[self.team.id, self.stage.id]
        )

    def test_get_squad_still_works(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["starters"]), 11)
        self.assertEqual(len(resp.data["bench"]), 4)

    def test_put_squad_is_gone(self):
        _, selections = self._make_valid_squad(team=self.away)
        resp = self.client.put(
            self.url, {"selections": selections}, format="json"
        )
        self.assertEqual(resp.status_code, 405)


# ---------------------------------------------------------------------------
# Fantasy groups API
# ---------------------------------------------------------------------------
class FantasyGroupAPITests(FantasyAPITestBase):
    def _groups_url(self):
        return reverse("fantasy:group-list")

    def _join_url(self):
        return reverse("fantasy:group-join")

    def test_create_group(self):
        resp = self.client.post(self._groups_url(), {"name": "Fam"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Fam")
        self.assertEqual(resp.data["member_count"], 1)
        self.assertEqual(len(resp.data["invite_code"]), 8)
        self.assertNotIn("owner_email", resp.data)
        self.assertIn("owner_id", resp.data)
        self.assertIn("owner_display_name", resp.data)

    def test_list_only_my_groups(self):
        self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        outsider = User.objects.create_user(
            email="other@example.com", password="StrongPass!23"
        )
        create_group(owner=outsider, name="NotMine")
        resp = self.client.get(self._groups_url())
        names = [g["name"] for g in resp.data]
        self.assertEqual(names, ["Mine"])

    def test_join_group_with_invite_code(self):
        owner = User.objects.create_user(
            email="owner@example.com", password="StrongPass!23"
        )
        group = create_group(owner=owner, name="Crew")
        resp = self.client.post(
            self._join_url(), {"invite_code": group.invite_code}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["id"], group.id)

    def test_duplicate_join_rejected(self):
        owner = User.objects.create_user(
            email="owner2@example.com", password="StrongPass!23"
        )
        group = create_group(owner=owner, name="Crew")
        self.client.post(
            self._join_url(), {"invite_code": group.invite_code}, format="json"
        )
        resp = self.client.post(
            self._join_url(), {"invite_code": group.invite_code}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_invite_code_rejected(self):
        resp = self.client.post(
            self._join_url(), {"invite_code": "NOPE0000"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_group_detail_requires_membership(self):
        owner = User.objects.create_user(
            email="owner3@example.com", password="StrongPass!23"
        )
        group = create_group(owner=owner, name="Private")
        resp = self.client.get(reverse("fantasy:group-detail", args=[group.id]))
        self.assertEqual(resp.status_code, 403)

    def test_group_detail_ok_for_member(self):
        resp = self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        gid = resp.data["id"]
        resp = self.client.get(reverse("fantasy:group-detail", args=[gid]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], gid)

    def test_member_display_name_not_email(self):
        resp = self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        gid = resp.data["id"]
        resp = self.client.get(reverse("fantasy:group-detail", args=[gid]))
        member = resp.data["members"][0]
        self.assertNotIn("email", member)
        self.assertIn("user_id", member)
        self.assertIn("display_name", member)

    def test_group_leave(self):
        resp = self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        gid = resp.data["id"]
        code = resp.data["invite_code"]
        other = User.objects.create_user(
            email="other5@example.com", password="StrongPass!23"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        other_client.post(
            self._join_url(), {"invite_code": code}, format="json"
        )
        leave_url = reverse("fantasy:group-leave", args=[gid])
        resp = other_client.post(leave_url)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(
            FantasyGroupMembership.objects.filter(
                group_id=gid, user=other
            ).exists()
        )

    def test_group_owner_leave_rejected(self):
        resp = self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        gid = resp.data["id"]
        resp = self.client.post(reverse("fantasy:group-leave", args=[gid]))
        self.assertEqual(resp.status_code, 400)

    def test_group_owner_remove_member(self):
        resp = self.client.post(self._groups_url(), {"name": "Mine"}, format="json")
        gid = resp.data["id"]
        code = resp.data["invite_code"]
        other = User.objects.create_user(
            email="other6@example.com", password="StrongPass!23"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        other_client.post(
            self._join_url(), {"invite_code": code}, format="json"
        )
        remove_url = reverse(
            "fantasy:group-member-remove", args=[gid, other.id]
        )
        resp = self.client.post(remove_url)
        self.assertEqual(resp.status_code, 204)


# ---------------------------------------------------------------------------
# Fantasy leaderboards API
# ---------------------------------------------------------------------------
class FantasyLeaderboardAPITests(FantasyAPITestBase):
    def test_anonymous_cannot_view_leaderboard(self):
        anon = APIClient()
        resp = anon.get(reverse("fantasy:global-leaderboard"))
        self.assertIn(resp.status_code, (401, 403))

    def test_leaderboard_requires_scope_params(self):
        resp = self.client.get(reverse("fantasy:global-leaderboard"))
        self.assertEqual(resp.status_code, 400)

    def test_stage_leaderboard_lists_teams(self):
        resp = self.client.post(
            reverse("fantasy:team-list"),
            {"name": "Alpha", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        _, selections = self._make_valid_squad()
        self.client.post(
            reverse("fantasy:team-starting-squad", args=[tid, self.stage.id]),
            {"selections": selections}, format="json",
        )
        resp = self.client.get(
            reverse("fantasy:global-leaderboard"),
            {"competition": self.competition.id, "season": self.season.id,
             "stage": self.stage.id},
        )
        self.assertEqual(resp.status_code, 200)
        rows = resp.data["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Alpha")
        self.assertEqual(rows[0]["total_points"], 0)
        self.assertNotIn("owner_email", rows[0])
        self.assertIn("owner_display_name", rows[0])

    def test_season_leaderboard_without_stage(self):
        resp = self.client.get(
            reverse("fantasy:global-leaderboard"),
            {"competition": self.competition.id, "season": self.season.id},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("rows", resp.data)

    def test_group_leaderboard_requires_membership(self):
        owner = User.objects.create_user(
            email="owner7@example.com", password="StrongPass!23"
        )
        group = create_group(owner=owner, name="Private")
        resp = self.client.get(
            reverse("fantasy:group-leaderboard", args=[group.id]),
            {"competition": self.competition.id, "season": self.season.id},
        )
        self.assertEqual(resp.status_code, 403)

    def test_group_leaderboard_for_member(self):
        resp = self.client.post(
            reverse("fantasy:group-list"), {"name": "Mine"}, format="json"
        )
        gid = resp.data["id"]
        resp = self.client.get(
            reverse("fantasy:group-leaderboard", args=[gid]),
            {"competition": self.competition.id, "season": self.season.id},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["group_id"], gid)


# ---------------------------------------------------------------------------
# FantasyPoints are read-only
# ---------------------------------------------------------------------------
class FantasyPointsReadOnlyTests(FantasyAPITestBase):
    def test_no_fantasy_points_endpoint_exists(self):
        resp = self.client.post("/api/fantasy/points/", {}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_fantasy_points_not_creatable_via_starting_squad_endpoint(self):
        resp = self.client.post(
            reverse("fantasy:team-list"),
            {"name": "T", "competition_id": self.competition.id,
             "season_id": self.season.id},
            format="json",
        )
        tid = resp.data["id"]
        _, selections = self._make_valid_squad()
        payload = {"selections": selections, "points": 999}
        resp = self.client.post(
            reverse("fantasy:team-starting-squad", args=[tid, self.stage.id]),
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FantasyPoints.objects.count(), 0)


# ---------------------------------------------------------------------------
# Season leaderboard — no double counting across stages
# ---------------------------------------------------------------------------
class SeasonLeaderboardNoDoubleCountingTests(FantasyTestBase):
    """
    Regression: a player who scored in multiple stages used to have their
    season-aggregated points applied to EVERY stage selection.
    """

    def setUp(self):
        super().setUp()
        self.stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        self.team = self._make_team(name="Alpha")
        self.players = [
            self._player(self.home, pos, f"P{i}")
            for i, pos in enumerate(POSITIONS_15)
        ]
        for stage in (self.stage, self.stage2):
            selections = [
                {"player_id": p.id, "is_starter": i < 11, "is_captain": i == 0}
                for i, p in enumerate(self.players)
            ]
            create_starting_squad(
                fantasy_team=self.team, stage=stage, selections=selections
            )

    def _match_in_stage(self, stage):
        return create_match(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=stage,
        )

    def test_season_total_sums_per_stage_not_duplicated(self):
        p = self.players[1]
        m1 = self._match_in_stage(self.stage)
        m2 = self._match_in_stage(self.stage2)
        FantasyPoints.objects.create(match=m1, player=p, points=5)
        FantasyPoints.objects.create(match=m2, player=p, points=7)

        rows = season_leaderboard(
            competition=self.competition, season=self.season
        )
        self.assertEqual(rows[0]["total_points"], 12)

    def test_stage_leaderboard_only_sees_that_stage(self):
        p = self.players[1]
        m1 = self._match_in_stage(self.stage)
        m2 = self._match_in_stage(self.stage2)
        FantasyPoints.objects.create(match=m1, player=p, points=5)
        FantasyPoints.objects.create(match=m2, player=p, points=7)

        s1 = stage_leaderboard(
            competition=self.competition, season=self.season, stage=self.stage
        )
        s2 = stage_leaderboard(
            competition=self.competition, season=self.season, stage=self.stage2
        )
        self.assertEqual(s1[0]["total_points"], 5)
        self.assertEqual(s2[0]["total_points"], 7)

    def test_captain_multiplier_is_per_stage_not_per_season_total(self):
        p = self.players[0]
        m1 = self._match_in_stage(self.stage)
        m2 = self._match_in_stage(self.stage2)
        FantasyPoints.objects.create(match=m1, player=p, points=5)
        FantasyPoints.objects.create(match=m2, player=p, points=7)

        rows = season_leaderboard(
            competition=self.competition, season=self.season
        )
        # Correct: (5 * 2) + (7 * 2) = 24
        self.assertEqual(rows[0]["total_points"], 24)

    def test_two_players_isolated_per_stage(self):
        a = self.players[1]
        b = self.players[2]
        m1 = self._match_in_stage(self.stage)
        m2 = self._match_in_stage(self.stage2)
        FantasyPoints.objects.create(match=m1, player=a, points=4)
        FantasyPoints.objects.create(match=m2, player=b, points=9)

        rows = season_leaderboard(
            competition=self.competition, season=self.season
        )
        self.assertEqual(rows[0]["total_points"], 13)


# ---------------------------------------------------------------------------
# Fantasy group owner privacy
# ---------------------------------------------------------------------------
class FantasyGroupOwnerPrivacyTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email="owner-priv@example.com", password="StrongPass!23",
            display_name="Owner Person",
        )
        self.client.force_authenticate(user=self.owner)

    def test_create_response_has_owner_id_and_display_name_no_email(self):
        resp = self.client.post(
            reverse("fantasy:group-list"), {"name": "G"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("owner_id", resp.data)
        self.assertIn("owner_display_name", resp.data)
        self.assertNotIn("owner_email", resp.data)
        self.assertEqual(resp.data["owner_id"], self.owner.id)
        self.assertEqual(resp.data["owner_display_name"], "Owner Person")

    def test_detail_response_has_owner_id_and_display_name_no_email(self):
        resp = self.client.post(
            reverse("fantasy:group-list"), {"name": "G"}, format="json"
        )
        gid = resp.data["id"]
        resp = self.client.get(reverse("fantasy:group-detail", args=[gid]))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("owner_id", resp.data)
        self.assertIn("owner_display_name", resp.data)
        self.assertNotIn("owner_email", resp.data)

    def test_member_entries_do_not_expose_email(self):
        resp = self.client.post(
            reverse("fantasy:group-list"), {"name": "G"}, format="json"
        )
        gid = resp.data["id"]
        resp = self.client.get(reverse("fantasy:group-detail", args=[gid]))
        for m in resp.data["members"]:
            self.assertNotIn("email", m)
            self.assertIn("user_id", m)
            self.assertIn("display_name", m)


# ---------------------------------------------------------------------------
# Fantasy economy (Phase 1)
# ---------------------------------------------------------------------------
class FantasyEconomyTests(FantasyTestBase):
    def test_set_player_price_creates_row(self):
        p = self._player(self.home, "MID", "M", price=None)
        self.assertIsNone(get_player_price(p))
        obj = set_player_price(player=p, price=Decimal("7.5"))
        self.assertEqual(obj.price, Decimal("7.5"))
        self.assertEqual(get_player_price(p), Decimal("7.5"))

    def test_set_player_price_updates_existing(self):
        p = self._player(self.home, "MID", "M", price=Decimal("5.0"))
        set_player_price(player=p, price=Decimal("8.0"))
        p.refresh_from_db()
        self.assertEqual(get_player_price(p), Decimal("8.0"))
        self.assertEqual(FantasyPlayerPrice.objects.filter(player=p).count(), 1)

    def test_price_below_minimum_rejected(self):
        p = self._player(self.home, "MID", "M", price=None)
        with self.assertRaises(FantasyError):
            set_player_price(player=p, price=Decimal("1.0"))

    def test_price_above_maximum_rejected(self):
        p = self._player(self.home, "MID", "M", price=None)
        with self.assertRaises(FantasyError):
            set_player_price(player=p, price=MAX_PLAYER_PRICE + Decimal("0.1"))

    def test_price_none_rejected(self):
        p = self._player(self.home, "MID", "M", price=None)
        with self.assertRaises(FantasyError):
            set_player_price(player=p, price=None)

    def test_new_team_has_default_budget(self):
        team = self._make_team(name="T")
        self.assertEqual(team.starting_budget, DEFAULT_STARTING_BUDGET)

    def test_squad_within_budget_accepted(self):
        team = self._make_team(name="T")
        _, selections = self._make_valid_squad()
        create_starting_squad(fantasy_team=team, stage=self.stage, selections=selections)
        self.assertEqual(team.selections.filter(stage=self.stage).count(), 15)

    def test_squad_over_budget_rejected(self):
        team = self._make_team(name="T")
        players = []
        for pos, count in [("GK", 2), ("DEF", 5), ("MID", 5), ("ATT", 3)]:
            players += [
                self._player(self.home, pos, f"{pos}{i}", price=Decimal("7.0"))
                for i in range(count)
            ]
        selections = [
            {"player_id": p.id, "is_starter": i < 11, "is_captain": i == 0}
            for i, p in enumerate(players)
        ]
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(fantasy_team=team, stage=self.stage, selections=selections)
        self.assertIn("exceeds budget", str(ctx.exception))
        self.assertEqual(team.selections.count(), 0)

    def test_squad_at_exact_budget_accepted(self):
        team = self._make_team(name="T")
        players = []
        players += [self._player(self.home, "GK", f"GK{i}", price=Decimal("4.0")) for i in range(2)]
        players += [self._player(self.home, "DEF", f"DEF{i}", price=Decimal("6.0")) for i in range(5)]
        players += [self._player(self.home, "MID", f"MID{i}", price=Decimal("7.0")) for i in range(5)]
        players += [self._player(self.home, "ATT", f"ATT{i}", price=Decimal("9.0")) for i in range(3)]
        selections = [
            {"player_id": p.id, "is_starter": i < 11, "is_captain": i == 0}
            for i, p in enumerate(players)
        ]
        create_starting_squad(fantasy_team=team, stage=self.stage, selections=selections)
        self.assertEqual(team.selections.filter(stage=self.stage).count(), 15)

    def test_player_without_price_rejected(self):
        team = self._make_team(name="T")
        _, selections = self._make_valid_squad()
        FantasyPlayerPrice.objects.filter(
            player_id=selections[0]["player_id"]
        ).delete()
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(fantasy_team=team, stage=self.stage, selections=selections)
        self.assertIn("no fantasy price", str(ctx.exception))

    def test_squad_total_cost_helper(self):
        team = self._make_team(name="T")
        _, selections = self._make_valid_squad()
        create_starting_squad(fantasy_team=team, stage=self.stage, selections=selections)
        rows = list(team.selections.filter(stage=self.stage))
        total = squad_total_cost(rows)
        self.assertEqual(total, Decimal("75.0"))


# ---------------------------------------------------------------------------
# Phase 2 — Gameweek scope
# ---------------------------------------------------------------------------
class GameweekScopeTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="T")
        _, self.valid = self._make_valid_squad()

    def test_gameweek_stage_accepted(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        self.assertEqual(
            self.team.selections.filter(stage=self.stage).count(), 15
        )

    def test_round_stage_rejected(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-p2",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-p2"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(
                fantasy_team=self.team, stage=round_stage, selections=self.valid
            )
        self.assertIn("GAMEWEEK", str(ctx.exception))

    def test_stage_from_same_season_accepted(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        create_starting_squad(fantasy_team=self.team, stage=stage2, selections=self.valid)
        self.assertEqual(
            self.team.selections.filter(stage=stage2).count(), 15
        )

    def test_stage_from_different_season_rejected(self):
        other_season = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-p2"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(
                fantasy_team=self.team,
                stage=other_stage,
                selections=self.valid,
            )
        self.assertIn("season", str(ctx.exception).lower())

    def test_stage_from_different_competition_rejected(self):
        other_comp = Competition.objects.create(
            organization=self.org, name="L2", slug="l2-p2",
            type=Competition.Type.LEAGUE,
        )
        other_season = Season.objects.create(
            competition=other_comp, name="2026", slug="2026-l2-p2"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(
                fantasy_team=self.team,
                stage=other_stage,
                selections=self.valid,
            )
        self.assertIn("season", str(ctx.exception).lower())

    def test_rejected_stage_leaves_existing_squad_unchanged(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        before = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )

        cup = Competition.objects.create(
            organization=self.org, name="Cup2", slug="cup2-p2",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-cup2-p2"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        with self.assertRaises(FantasyError):
            create_starting_squad(
                fantasy_team=self.team,
                stage=round_stage,
                selections=self.valid,
            )

        after = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before, after)


# ---------------------------------------------------------------------------
# Phase 2 — Historical gameweek state
# ---------------------------------------------------------------------------
class GameweekHistoricalTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="T")
        self.players, self.valid = self._make_valid_squad()
        self.stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )

    def test_two_gameweeks_coexist(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        new_player = self._player(self.home, "ATT", "NewATT", price=Decimal("5.0"))
        swapped = [dict(s) for s in self.valid]
        swapped[-1]["player_id"] = new_player.id
        create_starting_squad(fantasy_team=self.team, stage=self.stage2, selections=swapped)

        gw1 = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        gw2 = set(
            self.team.selections.filter(stage=self.stage2)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(len(gw1), 15)
        self.assertEqual(len(gw2), 15)
        self.assertNotEqual(gw1, gw2)
        self.assertIn(new_player.id, gw2)
        self.assertNotIn(new_player.id, gw1)

    def test_gw1_unchanged_after_gw2_submission(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        gw1_before = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )

        _, other_squad = self._make_valid_squad(team=self.away)
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage2, selections=other_squad
        )

        gw1_after = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(gw1_before, gw1_after)


# ---------------------------------------------------------------------------
# Phase 2 — Gameweek locking
# ---------------------------------------------------------------------------
class GameweekLockingTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="T")
        _, self.valid = self._make_valid_squad()

    def _start_match_in_stage(self, stage, *, status=Match.Status.LIVE,
                              minutes_ago=60):
        Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=stage,
            kickoff_at=timezone.now() - timedelta(minutes=minutes_ago),
            status=status,
        )

    def test_open_gameweek_can_be_edited(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        self.assertEqual(
            self.team.selections.filter(stage=self.stage).count(), 15
        )

    def test_locked_gameweek_rejected_on_create(self):
        self._start_match_in_stage(self.stage)
        with self.assertRaises(FantasyError) as ctx:
            create_starting_squad(
                fantasy_team=self.team, stage=self.stage, selections=self.valid
            )
        self.assertIn("locked", str(ctx.exception).lower())

    def test_locked_gameweek_via_status_only(self):
        Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
            kickoff_at=None,
            status=Match.Status.FINISHED,
        )
        with self.assertRaises(FantasyError):
            create_starting_squad(
                fantasy_team=self.team, stage=self.stage, selections=self.valid
            )

    def test_locked_gameweek_is_still_readable(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        self._start_match_in_stage(self.stage)

        self.assertEqual(
            self.team.selections.filter(stage=self.stage).count(), 15
        )
        self.assertTrue(is_gameweek_locked(self.stage))

    def test_postponed_match_with_past_kickoff_does_not_lock(self):
        Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
            kickoff_at=timezone.now() - timedelta(hours=2),
            status=Match.Status.POSTPONED,
        )
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        self.assertEqual(
            self.team.selections.filter(stage=self.stage).count(), 15
        )

    def test_locked_submission_leaves_existing_squad_unchanged(self):
        create_starting_squad(fantasy_team=self.team, stage=self.stage, selections=self.valid)
        before = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )

        self._start_match_in_stage(self.stage)

        _, other_squad = self._make_valid_squad(team=self.away)
        with self.assertRaises(FantasyError):
            create_starting_squad(
                fantasy_team=self.team,
                stage=self.stage,
                selections=other_squad,
            )

        after = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before, after)


# ---------------------------------------------------------------------------
# Phase 3 — Transfers
# ---------------------------------------------------------------------------
class TransferServiceTests(FantasyTestBase):
    """
    Layout of _make_valid_squad's flat list:
      [0]  GK starter, captain
      [1]  GK starter
      [2-6] DEF starter
      [7-10] MID starter
      [11] MID bench
      [12-14] ATT bench
    """

    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="T")
        self.players, self.valid = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=self.valid
        )

    def _outsider(self, position, name, price=Decimal("5.0")):
        return self._player(self.away, position, name, price=price)

    def _set_team_budget(self, value):
        self.team.starting_budget = value
        self.team.save(update_fields=["starting_budget"])

    # -- success paths ----------------------------------------------------
    def test_successful_transfer_replaces_player(self):
        new_mid = self._outsider("MID", "NewMID")
        transfer = make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],
            player_in=new_mid,
        )
        self.assertIsNotNone(transfer.id)
        ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertNotIn(self.players[11].id, ids)
        self.assertIn(new_mid.id, ids)

    def test_incoming_takes_bench_slot(self):
        new_mid = self._outsider("MID", "NewMID")
        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],  # bench MID
            player_in=new_mid,
        )
        row = self.team.selections.get(stage=self.stage, player=new_mid)
        self.assertFalse(row.is_starter)
        self.assertFalse(row.is_captain)

    def test_incoming_takes_starter_slot(self):
        new_mid = self._outsider("MID", "NewMID")
        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[7],  # starter MID
            player_in=new_mid,
        )
        row = self.team.selections.get(stage=self.stage, player=new_mid)
        self.assertTrue(row.is_starter)

    def test_transfer_record_created(self):
        new_mid = self._outsider("MID", "NewMID")
        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],
            player_in=new_mid,
        )
        self.assertEqual(
            FantasyTransfer.objects.filter(
                fantasy_team=self.team, stage=self.stage
            ).count(),
            1,
        )

    def test_transfer_requires_existing_starting_squad(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        new_mid = self._outsider("MID", "X")
        with self.assertRaises(FantasyError) as ctx:
            make_transfer(
                fantasy_team=self.team,
                stage=stage2,
                player_out=self.players[11],
                player_in=new_mid,
            )
        self.assertIn("starting squad", str(ctx.exception).lower())

    # -- captain ----------------------------------------------------------
    def test_cannot_transfer_captain_out(self):
        new_gk = self._outsider("GK", "NewGK")
        with self.assertRaises(FantasyError) as ctx:
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[0],  # captain
                player_in=new_gk,
            )
        self.assertIn("captain", str(ctx.exception).lower())

    # -- player checks ----------------------------------------------------
    def test_outgoing_not_in_squad_rejected(self):
        outsider_out = self._outsider("MID", "NotMine")
        outsider_in = self._outsider("MID", "In")
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=outsider_out,
                player_in=outsider_in,
            )

    def test_incoming_already_in_squad_rejected(self):
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=self.players[12],  # already in squad
            )

    def test_same_player_out_and_in_rejected(self):
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=self.players[11],
            )

    def test_incoming_without_price_rejected(self):
        noprice = self._player(self.away, "MID", "NoPrice", price=None)
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=noprice,
            )

    # -- composition ------------------------------------------------------
    def test_composition_breaks_rejected(self):
        new_att = self._outsider("ATT", "NewATT")
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],  # MID
                player_in=new_att,
            )

    # -- budget -----------------------------------------------------------
    def test_budget_exceeded_rejected(self):
        self._set_team_budget(Decimal("80.0"))
        expensive = self._outsider("MID", "Expensive", price=Decimal("20.0"))
        with self.assertRaises(FantasyError) as ctx:
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=expensive,
            )
        self.assertIn("budget", str(ctx.exception).lower())

    def test_transfer_within_budget_succeeds(self):
        new_mid = self._outsider("MID", "Cheap", price=Decimal("4.5"))
        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],
            player_in=new_mid,
        )

    # -- stage rules ------------------------------------------------------
    def test_locked_gameweek_rejected(self):
        Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
            stage=self.stage,
            kickoff_at=timezone.now() - timedelta(minutes=10),
            status=Match.Status.LIVE,
        )
        new_mid = self._outsider("MID", "NewMID")
        with self.assertRaises(FantasyError) as ctx:
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=new_mid,
            )
        self.assertIn("locked", str(ctx.exception).lower())

    def test_round_stage_rejected(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-p3",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-p3"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        new_mid = self._outsider("MID", "NewMID")
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=round_stage,
                player_out=self.players[11],
                player_in=new_mid,
            )

    def test_wrong_season_rejected(self):
        other_season = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-p3"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        new_mid = self._outsider("MID", "NewMID")
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=other_stage,
                player_out=self.players[11],
                player_in=new_mid,
            )

    def test_wrong_competition_rejected(self):
        other_comp = Competition.objects.create(
            organization=self.org, name="L2", slug="l2-p3",
            type=Competition.Type.LEAGUE,
        )
        other_season = Season.objects.create(
            competition=other_comp, name="2026", slug="2026-l2-p3"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        new_mid = self._outsider("MID", "NewMID")
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=other_stage,
                player_out=self.players[11],
                player_in=new_mid,
            )

    # -- transfer limit ---------------------------------------------------
    def test_first_transfer_allowed_second_rejected(self):
        m1 = self._outsider("MID", "M1")
        m2 = self._outsider("MID", "M2")
        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],
            player_in=m1,
        )
        with self.assertRaises(FantasyError) as ctx:
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=m1,
                player_in=m2,
            )
        self.assertIn("limit", str(ctx.exception).lower())

    def test_limit_scoped_per_gameweek(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        create_starting_squad(
            fantasy_team=self.team, stage=stage2, selections=self.valid
        )
        m1 = self._outsider("MID", "M1")
        m2 = self._outsider("MID", "M2")

        make_transfer(
            fantasy_team=self.team,
            stage=self.stage,
            player_out=self.players[11],
            player_in=m1,
        )
        self.assertEqual(transfers_remaining(fantasy_team=self.team, stage=self.stage), 0)
        self.assertEqual(transfers_remaining(fantasy_team=self.team, stage=stage2), 1)

        make_transfer(
            fantasy_team=self.team,
            stage=stage2,
            player_out=self.players[11],
            player_in=m2,
        )

    # -- historical integrity --------------------------------------------
    def test_historical_gameweek_unchanged(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        create_starting_squad(
            fantasy_team=self.team, stage=stage2, selections=self.valid
        )
        gw1_before = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )

        new_mid = self._outsider("MID", "NewMID")
        make_transfer(
            fantasy_team=self.team,
            stage=stage2,
            player_out=self.players[11],
            player_in=new_mid,
        )

        gw1_after = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(gw1_before, gw1_after)
        self.assertTrue(
            FantasyTransfer.objects.filter(
                fantasy_team=self.team, stage=stage2
            ).exists()
        )
        self.assertFalse(
            FantasyTransfer.objects.filter(
                fantasy_team=self.team, stage=self.stage
            ).exists()
        )

    # -- atomicity --------------------------------------------------------
    def test_failed_transfer_leaves_squad_and_transfer_count_unchanged(self):
        before_ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        before_transfers = FantasyTransfer.objects.count()

        noprice = self._player(self.away, "MID", "NoPrice", price=None)
        with self.assertRaises(FantasyError):
            make_transfer(
                fantasy_team=self.team,
                stage=self.stage,
                player_out=self.players[11],
                player_in=noprice,
            )

        after_ids = set(
            self.team.selections.filter(stage=self.stage)
            .values_list("player_id", flat=True)
        )
        self.assertEqual(before_ids, after_ids)
        self.assertEqual(FantasyTransfer.objects.count(), before_transfers)


class TransferAPITests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.team = self._make_team(name="T")
        self.players, self.valid = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=self.valid
        )
        self.url = reverse("fantasy:team-transfers", args=[self.team.id])

    def _outsider(self, position, name, price=Decimal("5.0")):
        return self._player(self.away, position, name, price=price)

    def test_owner_can_transfer(self):
        new_mid = self._outsider("MID", "NewMID")
        resp = self.client.post(
            self.url,
            {
                "stage_id": self.stage.id,
                "player_out_id": self.players[11].id,
                "player_in_id": new_mid.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("transfer", resp.data)
        self.assertIn("squad", resp.data)
        self.assertEqual(resp.data["transfers_used"], 1)
        self.assertEqual(resp.data["transfers_remaining"], 0)
        for key in ("stage", "locked", "starters", "bench", "captain_id",
                    "squad_value", "remaining_budget",
                    "transfers_used", "transfers_remaining", "transfer_limit"):
            self.assertIn(key, resp.data["squad"])

    def test_anonymous_cannot_transfer(self):
        anon = APIClient()
        new_mid = self._outsider("MID", "NewMID")
        resp = anon.post(
            self.url,
            {
                "stage_id": self.stage.id,
                "player_out_id": self.players[11].id,
                "player_in_id": new_mid.id,
            },
            format="json",
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_other_user_cannot_transfer(self):
        other = User.objects.create_user(
            email="other-p3@example.com", password="StrongPass!23"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        new_mid = self._outsider("MID", "NewMID")
        resp = other_client.post(
            self.url,
            {
                "stage_id": self.stage.id,
                "player_out_id": self.players[11].id,
                "player_in_id": new_mid.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(FantasyTransfer.objects.count(), 0)

    def test_put_squad_cannot_bypass_transfer_limit(self):
        new_mid = self._outsider("MID", "NewMID")
        r = self.client.post(
            reverse("fantasy:team-transfers", args=[self.team.id]),
            {
                "stage_id": self.stage.id,
                "player_out_id": self.players[11].id,
                "player_in_id": new_mid.id,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201)

        squad_url = reverse(
            "fantasy:team-squad", args=[self.team.id, self.stage.id]
        )
        _, other_squad = self._make_valid_squad(team=self.away)
        resp = self.client.put(
            squad_url, {"selections": other_squad}, format="json"
        )
        self.assertEqual(resp.status_code, 405)

    def test_missing_stage_id_rejected(self):
        new_mid = self._outsider("MID", "NewMID")
        resp = self.client.post(
            self.url,
            {
                "player_out_id": self.players[11].id,
                "player_in_id": new_mid.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_nonexistent_player_404(self):
        resp = self.client.post(
            self.url,
            {
                "stage_id": self.stage.id,
                "player_out_id": 999999,
                "player_in_id": 999998,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_composition_failure_returns_400(self):
        new_att = self._outsider("ATT", "NewATT")
        resp = self.client.post(
            self.url,
            {
                "stage_id": self.stage.id,
                "player_out_id": self.players[11].id,  # MID
                "player_in_id": new_att.id,             # ATT
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)


# ---------------------------------------------------------------------------
# Phase 4 — Gameweek points
# ---------------------------------------------------------------------------
class GameweekPointsServiceTests(FantasyTestBase):
    """
    Layout of _make_valid_squad's flat player list (15 players):
        0     GK starter (captain by default)
        1     GK starter
        2-6   DEF starters
        7-10  MID starters
        11    MID bench
        12-14 ATT bench
    """

    def setUp(self):
        super().setUp()
        self.team = self._make_team(name="T")
        self.players, self.valid = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=self.valid
        )

    def _match(self, stage, home=None, away=None):
        return Match.objects.create(
            competition=self.competition,
            home_team=home or self.home,
            away_team=away or self.away,
            stage=stage,
        )

    def _points(self, match, player, points):
        return FantasyPoints.objects.create(
            match=match, player=player, points=points
        )

    def test_empty_gameweek_returns_zeros(self):
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        self.assertEqual(data["total_points"], 0)
        self.assertEqual(data["starting_xi_points"], 0)
        self.assertEqual(data["bench_points"], 0)
        self.assertEqual(len(data["players"]), 15)

    def test_starter_points_aggregate(self):
        m = self._match(self.stage)
        self._points(m, self.players[1], 5)   # GK starter
        self._points(m, self.players[2], 7)   # DEF starter
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        self.assertEqual(data["total_points"], 12)
        self.assertEqual(data["starting_xi_points"], 12)

    def test_captain_multiplied_by_two(self):
        m = self._match(self.stage)
        self._points(m, self.players[0], 8)   # captain (GK starter)
        self._points(m, self.players[2], 5)   # non-captain starter
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        # 8 * 2 + 5 = 21
        self.assertEqual(data["total_points"], 21)
        captain_row = next(p for p in data["players"] if p["is_captain"])
        self.assertEqual(captain_row["base_points"], 8)
        self.assertEqual(captain_row["multiplier"], 2)
        self.assertEqual(captain_row["points"], 16)

    def test_bench_points_excluded_from_total(self):
        m = self._match(self.stage)
        self._points(m, self.players[11], 10)  # bench MID
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        self.assertEqual(data["total_points"], 0)
        self.assertEqual(data["starting_xi_points"], 0)
        self.assertEqual(data["bench_points"], 10)
        bench_row = next(p for p in data["players"] if not p["is_starter"])
        self.assertEqual(bench_row["base_points"], 10)

    def test_bench_players_appear_in_response(self):
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        bench_rows = [p for p in data["players"] if not p["is_starter"]]
        starter_rows = [p for p in data["players"] if p["is_starter"]]
        self.assertEqual(len(bench_rows), 4)
        self.assertEqual(len(starter_rows), 11)

    def test_zero_point_players_still_appear(self):
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        self.assertEqual(len(data["players"]), 15)
        for p in data["players"]:
            self.assertEqual(p["base_points"], 0)
            self.assertEqual(p["points"], 0)

    def test_multi_match_in_same_stage_aggregates(self):
        m1 = self._match(self.stage)
        m2 = self._match(self.stage)
        self._points(m1, self.players[1], 5)
        self._points(m2, self.players[1], 3)
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        # players[1] is a non-captain starter → contributes 8
        self.assertEqual(data["total_points"], 8)

    def test_points_from_other_stage_do_not_contribute(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        m1 = self._match(self.stage)
        m2 = self._match(stage2)
        self._points(m1, self.players[1], 6)
        self._points(m2, self.players[1], 10)
        data = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        self.assertEqual(data["total_points"], 6)

    def test_historical_gameweek_uses_its_own_squad(self):
        stage2 = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=2
        )
        new_mid = self._player(self.away, "MID", "NewMID")
        gw2_payload = [
            {"player_id": new_mid.id if s["player_id"] == self.players[11].id else s["player_id"],
             "is_starter": s["is_starter"],
             "is_captain": s["is_captain"]}
            for s in self.valid
        ]
        create_starting_squad(
            fantasy_team=self.team, stage=stage2, selections=gw2_payload
        )

        m1 = self._match(self.stage)
        m2 = self._match(stage2)
        self._points(m1, self.players[11], 9)   # in GW1 squad
        self._points(m2, self.players[11], 20)  # not in GW2 squad
        self._points(m2, new_mid, 4)            # in GW2 squad

        gw1 = get_gameweek_points(fantasy_team=self.team, stage=self.stage)
        gw2 = get_gameweek_points(fantasy_team=self.team, stage=stage2)

        self.assertEqual(gw1["bench_points"], 9)
        self.assertEqual(gw1["total_points"], 0)
        self.assertEqual(gw2["bench_points"], 4)
        self.assertEqual(gw2["total_points"], 0)

    def test_round_stage_rejected(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-p4",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-p4"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        with self.assertRaises(FantasyError):
            get_gameweek_points(fantasy_team=self.team, stage=round_stage)

    def test_wrong_season_rejected(self):
        other_season = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-p4"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(FantasyError):
            get_gameweek_points(fantasy_team=self.team, stage=other_stage)

    def test_wrong_competition_rejected(self):
        other_comp = Competition.objects.create(
            organization=self.org, name="L2", slug="l2-p4",
            type=Competition.Type.LEAGUE,
        )
        other_season = Season.objects.create(
            competition=other_comp, name="2026", slug="2026-l2-p4"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        with self.assertRaises(FantasyError):
            get_gameweek_points(fantasy_team=self.team, stage=other_stage)

    def test_no_squad_for_stage_returns_empty(self):
        stage_empty = Stage.objects.create(
            season=self.season, kind=Stage.Kind.GAMEWEEK, number=3
        )
        data = get_gameweek_points(
            fantasy_team=self.team, stage=stage_empty
        )
        self.assertEqual(data["total_points"], 0)
        self.assertEqual(data["players"], [])


class GameweekPointsAPITests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.team = self._make_team(name="T")
        self.players, self.valid = self._make_valid_squad()
        create_starting_squad(
            fantasy_team=self.team, stage=self.stage, selections=self.valid
        )

    def _url(self):
        return reverse("fantasy:team-points", args=[self.team.id])

    def _match(self, stage, home=None, away=None):
        return Match.objects.create(
            competition=self.competition,
            home_team=home or self.home,
            away_team=away or self.away,
            stage=stage,
        )

    def _points(self, match, player, points):
        return FantasyPoints.objects.create(
            match=match, player=player, points=points
        )

    def test_owner_can_retrieve_points(self):
        m = self._match(self.stage)
        self._points(m, self.players[0], 8)   # captain
        self._points(m, self.players[1], 5)   # non-captain starter
        resp = self.client.get(self._url(), {"stage": self.stage.id})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_points"], 21)
        self.assertEqual(resp.data["starting_xi_points"], 21)
        self.assertIn("stage", resp.data)
        self.assertEqual(resp.data["stage"]["id"], self.stage.id)
        self.assertIn("players", resp.data)
        self.assertEqual(len(resp.data["players"]), 15)
        row = resp.data["players"][0]
        for key in ("player", "is_starter", "is_captain",
                    "base_points", "multiplier", "points"):
            self.assertIn(key, row)

    def test_anonymous_rejected(self):
        anon = APIClient()
        resp = anon.get(self._url(), {"stage": self.stage.id})
        self.assertIn(resp.status_code, (401, 403))

    def test_other_user_cannot_retrieve(self):
        other = User.objects.create_user(
            email="other-p4@example.com", password="StrongPass!23"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        resp = other_client.get(self._url(), {"stage": self.stage.id})
        self.assertEqual(resp.status_code, 404)

    def test_missing_stage_param_rejected(self):
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 400)

    def test_non_integer_stage_rejected(self):
        resp = self.client.get(self._url(), {"stage": "abc"})
        self.assertEqual(resp.status_code, 400)

    def test_unknown_stage_404(self):
        resp = self.client.get(self._url(), {"stage": 999999})
        self.assertEqual(resp.status_code, 404)

    def test_round_stage_rejected(self):
        cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-p4a",
            type=Competition.Type.CUP,
        )
        cup_season = Season.objects.create(
            competition=cup, name="2026", slug="2026-p4a"
        )
        round_stage = Stage.objects.create(
            season=cup_season, kind=Stage.Kind.ROUND, number=1
        )
        resp = self.client.get(self._url(), {"stage": round_stage.id})
        self.assertEqual(resp.status_code, 400)

    def test_wrong_season_rejected(self):
        other_season = Season.objects.create(
            competition=self.competition, name="2027", slug="2027-p4a"
        )
        other_stage = Stage.objects.create(
            season=other_season, kind=Stage.Kind.GAMEWEEK, number=1
        )
        resp = self.client.get(self._url(), {"stage": other_stage.id})
        self.assertEqual(resp.status_code, 400)