from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse  # noqa: F401  (kept for symmetry with other apps)

from league.models import Competition, Organization, Player, Team
from matches.models import Match, MatchEvent

from .models import (
    FantasyGroup,
    FantasyGroupMembership,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
)
from .services import (
    BENCH,
    CAPTAIN_MULTIPLIER,
    POSITION_REQUIREMENTS,
    SCORING_RULES,
    SQUAD_SIZE,
    STARTERS,
    FantasyError,
    calculate_match_points,
    create_fantasy_team,
    create_group,
    fantasy_team_total_points,
    global_leaderboard,
    group_leaderboard,
    join_group,
    recalculate_match_points,
    score_player_for_match,
    set_squad,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Base fixtures
# ---------------------------------------------------------------------------
class FantasyTestBase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")
        self.competition = Competition.objects.create(
            organization=self.org, name="League", slug="league"
        )
        self.home = Team.objects.create(organization=self.org, name="Home", slug="home")
        self.away = Team.objects.create(organization=self.org, name="Away", slug="away")
        self.competition.teams.add(self.home, self.away)

        self.match = Match.objects.create(
            competition=self.competition,
            home_team=self.home,
            away_team=self.away,
        )

        self.user = User.objects.create_user(
            email="fan@example.com", password="StrongPass!23", role=User.Role.USER
        )

    def _player(self, team, position, name="P", shirt=None):
        return Player.objects.create(
            team=team,
            first_name=name,
            position=position,
            shirt_number=shirt,
        )

    def _make_valid_squad(self, team=None):
        """Return (players, selections_payload) forming a valid 15-player squad."""
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


# ---------------------------------------------------------------------------
# Squad validation
# ---------------------------------------------------------------------------
class SquadValidationTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team = create_fantasy_team(user=self.user, name="My Team")
        self.players, self.valid = self._make_valid_squad()

    def _mutate(self, **kwargs):
        # deep-ish copy of the valid payload with a single tweak
        return [{**s, **kwargs} for s in self.valid]

    def test_valid_squad_accepted(self):
        set_squad(self.team, self.valid)
        self.assertEqual(self.team.selections.count(), SQUAD_SIZE)
        self.assertEqual(
            self.team.selections.filter(is_starter=True).count(), STARTERS
        )
        self.assertEqual(
            self.team.selections.filter(is_starter=False).count(), BENCH
        )
        self.assertEqual(
            self.team.selections.filter(is_captain=True).count(), 1
        )

    def test_wrong_total_count_rejected(self):
        with self.assertRaises(FantasyError):
            set_squad(self.team, self.valid[:-1])

    def test_wrong_gk_count_rejected(self):
        # Remove one GK, add one extra ATT
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        bad = [s for s in self.valid if s["player_id"] != self.players[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_wrong_def_count_rejected(self):
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        # Remove one DEF, add one extra ATT — keeps total 15, breaks DEF/ATT balance
        defs = [p for p in self.players if p.position == "DEF"]
        bad = [s for s in self.valid if s["player_id"] != defs[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_wrong_mid_count_rejected(self):
        extra_att = self._player(self.home, "ATT", "ExtraATT")
        mids = [p for p in self.players if p.position == "MID"]
        bad = [s for s in self.valid if s["player_id"] != mids[0].id]
        bad.append({"player_id": extra_att.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_wrong_att_count_rejected(self):
        extra_def = self._player(self.home, "DEF", "ExtraDEF")
        atts = [p for p in self.players if p.position == "ATT"]
        bad = [s for s in self.valid if s["player_id"] != atts[0].id]
        bad.append({"player_id": extra_def.id, "is_starter": False, "is_captain": False})
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_wrong_starter_count_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[0]["is_starter"] = False  # now 10 starters, 5 bench
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_wrong_bench_count_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[-1]["is_starter"] = True  # 12 starters, 3 bench
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_no_captain_rejected(self):
        bad = [{**s, "is_captain": False} for s in self.valid]
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_multiple_captains_rejected(self):
        bad = [dict(s) for s in self.valid]
        # valid[0] is already captain; promote valid[1] too
        bad[1]["is_captain"] = True
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_captain_on_bench_rejected(self):
        bad = [dict(s) for s in self.valid]
        # Move captaincy to the first non-starter
        for s in bad:
            s["is_captain"] = False
        bench_sel = next(s for s in bad if not s["is_starter"])
        bench_sel["is_captain"] = True
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_duplicate_player_rejected(self):
        bad = [dict(s) for s in self.valid]
        bad[-1]["player_id"] = bad[0]["player_id"]
        with self.assertRaises(FantasyError):
            set_squad(self.team, bad)

    def test_replace_squad_clears_previous(self):
        set_squad(self.team, self.valid)
        # A second valid squad on a different team
        other_team = create_fantasy_team(
            user=User.objects.create_user(
                email="other@example.com", password="StrongPass!23"
            ),
            name="Other",
        )
        players2, selections2 = self._make_valid_squad(team=self.away)
        set_squad(other_team, selections2)
        self.assertEqual(other_team.selections.count(), SQUAD_SIZE)

        # Replacing self.team's squad wipes the old rows first
        players3, selections3 = self._make_valid_squad(team=self.away)
        set_squad(self.team, selections3)
        self.assertEqual(self.team.selections.count(), SQUAD_SIZE)

    def test_player_uniqueness_enforced_at_db(self):
        set_squad(self.team, self.valid)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FantasyPlayerSelection.objects.create(
                    fantasy_team=self.team,
                    player=self.players[0],
                    is_starter=False,
                )


# ---------------------------------------------------------------------------
# Fantasy scoring
# ---------------------------------------------------------------------------
class ScoringTests(FantasyTestBase):
    def _goal(self, player, team, minute=10):
        return MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.GOAL,
            minute=minute,
            team=team,
            player=player,
        )

    def _card(self, player, team, card_type, minute=20):
        return MatchEvent.objects.create(
            match=self.match,
            type=card_type,
            minute=minute,
            team=team,
            player=player,
        )

    def _sub(self, off, on, team, minute):
        return MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.SUBSTITUTION,
            minute=minute,
            team=team,
            player=off,
            related_player=on,
        )

    # -- appearance / no events ---------------------------------------
    def test_no_events_zero_points(self):
        p = self._player(self.home, "ATT", "Ghost")
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(points, 0)
        self.assertEqual(breakdown, {})

    def test_appearance_awarded_with_any_event(self):
        p = self._player(self.home, "MID", "M")
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=30)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["appearance"], SCORING_RULES["appearance"])
        # yellow -1 + appearance 1 + minutes_60_plus 1 = 1
        self.assertEqual(points, 1)

    # -- goals by position --------------------------------------------
    def test_goal_by_gk(self):
        p = self._player(self.home, "GK", "GK")
        self._goal(p, self.home)
        # Break the clean sheet so we isolate the goal value.
        away_scorer = self._player(self.away, "ATT", "AW")
        self._goal(away_scorer, self.away, minute=20)

        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_GK"]
            + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_def(self):
        p = self._player(self.home, "DEF", "DEF")
        self._goal(p, self.home)
        # Break the clean sheet so we isolate the goal value.
        away_scorer = self._player(self.away, "ATT", "AW")
        self._goal(away_scorer, self.away, minute=20)

        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_DEF"]
            + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_mid(self):
        p = self._player(self.home, "MID", "MID")
        self._goal(p, self.home)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_MID"]
            + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    def test_goal_by_att(self):
        p = self._player(self.home, "ATT", "ATT")
        self._goal(p, self.home)
        points, _ = score_player_for_match(p, self.match)
        self.assertEqual(
            points,
            SCORING_RULES["goal_ATT"]
            + SCORING_RULES["appearance"]
            + SCORING_RULES["minutes_60_plus"],
        )

    # -- cards --------------------------------------------------------
    def test_yellow_card_negative(self):
        # MID avoids the clean-sheet bonus (only GK/DEF are eligible),
        # so this test isolates the yellow-card rule.
        p = self._player(self.home, "MID", "M")
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=30)

        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["yellow_cards"], -1)
        self.assertEqual(points, 1 - 1 + 1)  # appearance + yellow + 60m

    def test_red_card_negative(self):
        p = self._player(self.home, "DEF", "D")
        self._card(p, self.home, MatchEvent.Type.RED, minute=30)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["red_cards"], -3)

    def test_multiple_events_accumulate(self):
        p = self._player(self.home, "ATT", "A")
        self._goal(p, self.home, minute=10)
        self._goal(p, self.home, minute=40)
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=60)
        points, breakdown = score_player_for_match(p, self.match)
        # 2 * 4 (ATT goals) + 1 (app) + 1 (60m) - 1 (yellow) = 9
        self.assertEqual(points, 9)

    # -- clean sheet --------------------------------------------------
    def test_clean_sheet_for_gk_when_no_concede(self):
        p = self._player(self.home, "GK", "GK")
        # GK needs at least one event in the match to be "seen".
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertEqual(breakdown["clean_sheet"], SCORING_RULES["clean_sheet"])
        self.assertEqual(points, 1 + 1 + 4 - 1)  # app + 60m + cs - yellow

    def test_no_clean_sheet_when_conceded(self):
        p = self._player(self.home, "GK", "GK")
        scorer = self._player(self.away, "ATT", "AW")
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        self._goal(scorer, self.away, minute=20)
        points, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)
        self.assertEqual(points, 1 + 1 - 1)

    def test_clean_sheet_only_for_gk_def(self):
        p = self._player(self.home, "MID", "M")
        self._card(p, self.home, MatchEvent.Type.YELLOW, minute=45)
        _, breakdown = score_player_for_match(p, self.match)
        self.assertNotIn("clean_sheet", breakdown)

    # -- minutes heuristics -------------------------------------------
    def test_subbed_off_before_60_no_minutes_bonus(self):
        off = self._player(self.home, "MID", "OFF")
        on = self._player(self.home, "MID", "ON")
        self._sub(off, on, self.home, minute=55)
        _, breakdown = score_player_for_match(off, self.match)
        self.assertNotIn("minutes_60_plus", breakdown)

    def test_subbed_on_after_30_no_minutes_bonus(self):
        off = self._player(self.home, "MID", "OFF")
        on = self._player(self.home, "MID", "ON")
        self._sub(off, on, self.home, minute=70)
        _, breakdown = score_player_for_match(on, self.match)
        self.assertNotIn("minutes_60_plus", breakdown)

    def test_subbed_on_early_gets_minutes_bonus(self):
        off = self._player(self.home, "MID", "OFF")
        on = self._player(self.home, "MID", "ON")
        self._sub(off, on, self.home, minute=20)
        _, breakdown = score_player_for_match(on, self.match)
        self.assertIn("minutes_60_plus", breakdown)

    # -- persistence --------------------------------------------------
    def test_calculate_match_points_creates_rows(self):
        p = self._player(self.home, "ATT", "A")
        self._goal(p, self.home)
        written = calculate_match_points(self.match)
        self.assertEqual(len(written), 1)
        fp = FantasyPoints.objects.get(match=self.match, player=p)
        self.assertEqual(fp.points, 6)  # 4 goal + 1 app + 1 60m

    def test_recalculate_is_deterministic(self):
        p = self._player(self.home, "ATT", "A")
        self._goal(p, self.home)
        calculate_match_points(self.match)
        first = FantasyPoints.objects.get(match=self.match, player=p).points
        recalculate_match_points(self.match)
        second = FantasyPoints.objects.get(match=self.match, player=p).points
        self.assertEqual(first, second)

    def test_recalculate_clears_stale_rows(self):
        p = self._player(self.home, "ATT", "A")
        event = self._goal(p, self.home)
        calculate_match_points(self.match)
        self.assertEqual(
            FantasyPoints.objects.filter(match=self.match).count(), 1
        )
        event.delete()
        recalculate_match_points(self.match)
        self.assertEqual(
            FantasyPoints.objects.filter(match=self.match).count(), 0
        )


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
class LeaderboardTests(FantasyTestBase):
    def setUp(self):
        super().setUp()
        self.team_a = create_fantasy_team(user=self.user, name="Alpha")
        self.players, self.valid = self._make_valid_squad()
        set_squad(self.team_a, self.valid)

        # Give one starter a goal so the team scores.
        self.scorer = self.players[0]  # the captain, a GK in this fixture
        MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=self.scorer,
        )
        calculate_match_points(self.match)

    def test_global_leaderboard_includes_team(self):
        rows = global_leaderboard()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fantasy_team"].id, self.team_a.id)
        self.assertGreater(rows[0]["total_points"], 0)

    def test_captain_points_are_doubled(self):
        # Base points of captain in this match
        base = FantasyPoints.objects.get(
            match=self.match, player=self.scorer
        ).points
        total = fantasy_team_total_points(self.team_a)
        # The captain contributed doubled; all other starters contributed 0.
        self.assertEqual(total, base * CAPTAIN_MULTIPLIER)

    def test_bench_players_do_not_contribute(self):
        # Put a bench player on the scoresheet too; they must not affect the team total.
        bench_player = self.players[STARTERS]  # first non-starter
        MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.GOAL,
            minute=40,
            team=self.home,
            player=bench_player,
        )
        recalculate_match_points(self.match)

        before = fantasy_team_total_points(self.team_a)
        # Remove bench player's event entirely and recalc — total must not change.
        MatchEvent.objects.filter(
            match=self.match, player=bench_player
        ).delete()
        recalculate_match_points(self.match)
        after = fantasy_team_total_points(self.team_a)
        self.assertEqual(before, after)


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
        owner = self.user
        joiner = User.objects.create_user(
            email="joiner@example.com", password="StrongPass!23"
        )
        group = create_group(owner=owner, name="Crew")
        membership = join_group(user=joiner, invite_code=group.invite_code)
        self.assertEqual(membership.group, group)
        self.assertEqual(membership.user, joiner)

    def test_duplicate_membership_rejected(self):
        group = create_group(owner=self.user, name="Crew")
        with self.assertRaises(FantasyError):
            join_group(user=self.user, invite_code=group.invite_code)

    def test_invalid_invite_code_rejected(self):
        with self.assertRaises(FantasyError):
            join_group(user=self.user, invite_code="NOPE1234")

    def test_group_leaderboard_scoped_to_members(self):
        # Owner has a team with points.
        owner_team = create_fantasy_team(user=self.user, name="Owner")
        players, valid = self._make_valid_squad()
        set_squad(owner_team, valid)
        MatchEvent.objects.create(
            match=self.match,
            type=MatchEvent.Type.GOAL,
            minute=10,
            team=self.home,
            player=players[0],
        )
        calculate_match_points(self.match)

        # A second user with their own team, NOT in the group.
        outsider = User.objects.create_user(
            email="outsider@example.com", password="StrongPass!23"
        )
        outsider_team = create_fantasy_team(user=outsider, name="Outsider")
        players2, valid2 = self._make_valid_squad(team=self.away)
        set_squad(outsider_team, valid2)

        group = create_group(owner=self.user, name="Crew")
        rows = group_leaderboard(group)
        team_ids = {r["fantasy_team"].id for r in rows}
        self.assertIn(owner_team.id, team_ids)
        self.assertNotIn(outsider_team.id, team_ids)