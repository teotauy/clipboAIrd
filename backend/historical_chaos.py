"""
Season Chaos Engine.
Fetches every fixture from the current PL season, replays goal-by-goal,
scores each goal for "havoc" — the simultaneous swing it caused across
Top 4, Title, European, Relegation, and Golden Boot standings.
"""

import asyncio
from dataclasses import dataclass, field
from copy import deepcopy

import httpx

from config import API_FOOTBALL_KEY, API_FOOTBALL_BASE

PL_LEAGUE_ID = 39
PL_SEASON = 2025  # 2025/26 season


@dataclass
class StandingsSnapshot:
    """Minimal standings state — enough to measure position swings."""
    team_positions: dict[str, int] = field(default_factory=dict)
    team_points: dict[str, int] = field(default_factory=dict)
    team_gd: dict[str, int] = field(default_factory=dict)
    top4: list[str] = field(default_factory=list)
    europa: list[str] = field(default_factory=list)  # 5th/6th
    conference: list[str] = field(default_factory=list)  # 7th
    relegated: list[str] = field(default_factory=list)
    golden_boot_leader: str = ""
    golden_boot_goals: int = 0


@dataclass
class ChaosScore:
    fixture_id: int
    minute: int
    scorer: str
    team: str
    opponent: str
    score_at_time: str
    havoc_score: float
    breakdown: dict  # which metrics shifted and by how much
    narrative: str
    matchweek: int = 0
    ramifications: list[str] = field(default_factory=list)


class SeasonChaosEngine:
    def __init__(self):
        self.fixtures: list[dict] = []
        self.all_events: dict[int, list[dict]] = {}  # fixture_id → events
        self.top_chaos_goals: list[ChaosScore] = []

    async def run(self) -> list[ChaosScore]:
        async with httpx.AsyncClient() as client:
            await self._fetch_all_fixtures(client)
            await self._fetch_all_events(client)

        self.top_chaos_goals = self._replay_season()
        self.top_chaos_goals.sort(key=lambda g: g.havoc_score, reverse=True)
        return self.top_chaos_goals

    # ─── DATA FETCHING ────────────────────────────────────────────────────────

    async def _fetch_all_fixtures(self, client: httpx.AsyncClient):
        resp = await client.get(
            f"{API_FOOTBALL_BASE}/fixtures",
            params={"league": PL_LEAGUE_ID, "season": PL_SEASON, "status": "FT"},
            headers={"x-apisports-key": API_FOOTBALL_KEY},
            timeout=30.0,
        )
        data = resp.json()
        self.fixtures = data.get("response", [])

    async def _fetch_all_events(self, client: httpx.AsyncClient):
        # Batch in groups of 10 to avoid rate limits
        fixture_ids = [f["fixture"]["id"] for f in self.fixtures]
        for i in range(0, len(fixture_ids), 10):
            batch = fixture_ids[i : i + 10]
            tasks = [self._fetch_events(client, fid) for fid in batch]
            await asyncio.gather(*tasks)
            await asyncio.sleep(1.0)  # Rate limit courtesy

    async def _fetch_events(self, client: httpx.AsyncClient, fixture_id: int):
        try:
            resp = await client.get(
                f"{API_FOOTBALL_BASE}/fixtures/events",
                params={"fixture": fixture_id},
                headers={"x-apisports-key": API_FOOTBALL_KEY},
                timeout=15.0,
            )
            data = resp.json()
            self.all_events[fixture_id] = data.get("response", [])
        except Exception:
            self.all_events[fixture_id] = []

    # ─── SEASON REPLAY ────────────────────────────────────────────────────────

    def _replay_season(self) -> list[ChaosScore]:
        """
        Replay the season chronologically.
        Before each goal, snapshot the standings.
        After the goal, re-snapshot.
        Score the delta as havoc.
        """
        chaos_scores: list[ChaosScore] = []

        # Sort fixtures by date
        sorted_fixtures = sorted(
            self.fixtures,
            key=lambda f: f["fixture"]["date"],
        )

        # Running standings state
        points: dict[str, int] = {}
        wins: dict[str, int] = {}
        draws: dict[str, int] = {}
        losses: dict[str, int] = {}
        gf: dict[str, int] = {}
        ga: dict[str, int] = {}
        scorer_goals: dict[str, int] = {}
        scorer_team: dict[str, str] = {}

        # Build fixture_id → matchweek lookup
        fixture_mw: dict[int, int] = {}
        for f in sorted_fixtures:
            fid = f["fixture"]["id"]
            round_str = f.get("league", {}).get("round", "")
            try:
                fixture_mw[fid] = int(round_str.split(" - ")[-1])
            except (ValueError, IndexError):
                fixture_mw[fid] = 0

        for fixture in sorted_fixtures:
            fid = fixture["fixture"]["id"]
            home = fixture["teams"]["home"]["name"]
            away = fixture["teams"]["away"]["name"]

            for team in [home, away]:
                points.setdefault(team, 0)
                gf.setdefault(team, 0)
                ga.setdefault(team, 0)

            events = self.all_events.get(fid, [])
            goals = [
                e for e in events
                if e["type"] == "Goal"
                and e.get("detail") not in ("Missed Penalty",)
            ]
            goals.sort(key=lambda e: e["time"]["elapsed"])

            # Simulate this match goal by goal
            home_score = 0
            away_score = 0

            for goal in goals:
                minute = goal["time"]["elapsed"]
                scorer = goal["player"]["name"]
                scoring_team = goal["team"]["name"]
                is_own_goal = goal.get("detail") == "Own Goal"

                if is_own_goal:
                    conceding_team = scoring_team
                    scoring_team = away if scoring_team == home else home
                else:
                    conceding_team = away if scoring_team == home else home

                # Snapshot BEFORE
                before = self._build_snapshot(points, gf, ga, scorer_goals, scorer_team)

                # Apply goal
                if scoring_team == home:
                    home_score += 1
                else:
                    away_score += 1

                gf[scoring_team] = gf.get(scoring_team, 0) + 1
                ga[conceding_team] = ga.get(conceding_team, 0) + 1

                if not is_own_goal and scorer:
                    scorer_goals[scorer] = scorer_goals.get(scorer, 0) + 1
                    scorer_team[scorer] = scoring_team

                # Snapshot AFTER
                after = self._build_snapshot(points, gf, ga, scorer_goals, scorer_team)

                # Score the havoc
                score, breakdown = self._score_havoc(before, after, scoring_team, conceding_team)

                if score > 0:
                    chaos_scores.append(ChaosScore(
                        fixture_id=fid,
                        minute=minute,
                        scorer=scorer or "Own Goal",
                        team=scoring_team,
                        opponent=conceding_team,
                        score_at_time=f"{home} {home_score}–{away_score} {away}",
                        havoc_score=score,
                        breakdown=breakdown,
                        narrative=self._narrate_chaos(
                            scorer or "Own Goal", scoring_team, conceding_team,
                            minute, score, breakdown,
                            f"{home_score}–{away_score}"
                        ),
                        matchweek=fixture_mw.get(fid, 0),
                        ramifications=self._build_ramifications(before, after, scoring_team, conceding_team),
                    ))

            # Commit full-time result to standing points
            if home_score > away_score:
                points[home] = points.get(home, 0) + 3
            elif away_score > home_score:
                points[away] = points.get(away, 0) + 3
            else:
                points[home] = points.get(home, 0) + 1
                points[away] = points.get(away, 0) + 1

        return chaos_scores

    def _build_snapshot(
        self,
        points: dict,
        gf: dict,
        ga: dict,
        scorer_goals: dict,
        scorer_team: dict,
    ) -> StandingsSnapshot:
        teams = list(points.keys())
        gd = {t: gf.get(t, 0) - ga.get(t, 0) for t in teams}

        sorted_teams = sorted(
            teams,
            key=lambda t: (points.get(t, 0), gd.get(t, 0), gf.get(t, 0)),
            reverse=True,
        )

        positions = {t: i + 1 for i, t in enumerate(sorted_teams)}

        top4 = sorted_teams[:5]   # CL: top 5
        europa = sorted_teams[5:7]  # Europa League: 6th–7th
        conference = sorted_teams[7:8]  # Conference League qualifier: 8th
        relegated = sorted_teams[-3:] if len(sorted_teams) >= 20 else []

        if scorer_goals:
            leader = max(scorer_goals, key=lambda s: scorer_goals[s])
            leader_goals = scorer_goals[leader]
        else:
            leader, leader_goals = "", 0

        return StandingsSnapshot(
            team_positions=positions,
            team_points=dict(points),
            team_gd=gd,
            top4=top4,
            europa=europa,
            conference=conference,
            relegated=relegated,
            golden_boot_leader=leader,
            golden_boot_goals=leader_goals,
        )

    def _build_ramifications(
        self,
        before: StandingsSnapshot,
        after: StandingsSnapshot,
        scoring_team: str,
        conceding_team: str,
    ) -> list[str]:
        lines = []

        for team in set(list(before.team_positions.keys()) + list(after.team_positions.keys())):
            b_pos = before.team_positions.get(team)
            a_pos = after.team_positions.get(team)
            if b_pos is None or a_pos is None or b_pos == a_pos:
                continue

            moved = b_pos - a_pos  # positive = climbed
            direction = "climbed" if moved > 0 else "dropped"

            # Boundary crossings
            if team in before.top4 and team not in after.top4:
                lines.append(f"{team} fell out of the top 4")
            elif team not in before.top4 and team in after.top4:
                lines.append(f"{team} entered the top 4")

            if team in before.europa and team not in after.europa:
                lines.append(f"{team} lost their Europa League place")
            elif team not in before.europa and team in after.europa:
                lines.append(f"{team} moved into a Europa League place")

            if team in before.conference and team not in after.conference:
                lines.append(f"{team} lost the Conference League qualifier spot")
            elif team not in before.conference and team in after.conference:
                lines.append(f"{team} moved into the Conference League qualifier spot")

            if team in before.relegated and team not in after.relegated:
                lines.append(f"{team} climbed out of the relegation zone")
            elif team not in before.relegated and team in after.relegated:
                lines.append(f"{team} dropped into the relegation zone")
            elif abs(moved) >= 2 and team not in (scoring_team, conceding_team):
                lines.append(f"{team} {direction} {abs(moved)} place{'s' if abs(moved) > 1 else ''}")

        if before.golden_boot_leader and before.golden_boot_leader != after.golden_boot_leader:
            lines.append(
                f"{after.golden_boot_leader} overtook {before.golden_boot_leader} in the Golden Boot race"
            )

        return lines

    def _score_havoc(
        self,
        before: StandingsSnapshot,
        after: StandingsSnapshot,
        scoring_team: str,
        conceding_team: str,
    ) -> tuple[float, dict]:
        score = 0.0
        breakdown: dict[str, float] = {}

        def pos_change(team: str) -> int:
            return abs(
                before.team_positions.get(team, 20)
                - after.team_positions.get(team, 20)
            )

        # Top 4 boundary cross (biggest points = 3.0 per team)
        for team in [scoring_team, conceding_team]:
            b_in = team in before.top4
            a_in = team in after.top4
            if b_in != a_in:
                pts = 3.0
                score += pts
                breakdown["top4_boundary"] = breakdown.get("top4_boundary", 0) + pts

        # Relegation boundary cross
        for team in [scoring_team, conceding_team]:
            b_rel = team in before.relegated
            a_rel = team in after.relegated
            if b_rel != a_rel:
                pts = 3.0
                score += pts
                breakdown["relegation_boundary"] = breakdown.get("relegation_boundary", 0) + pts

        # Europa boundary cross (5th/6th)
        for team in [scoring_team, conceding_team]:
            b_eu = team in before.europa
            a_eu = team in after.europa
            if b_eu != a_eu:
                pts = 1.5
                score += pts
                breakdown["europa_boundary"] = breakdown.get("europa_boundary", 0) + pts

        # Conference boundary (7th)
        for team in [scoring_team, conceding_team]:
            b_co = team in before.conference
            a_co = team in after.conference
            if b_co != a_co:
                pts = 1.0
                score += pts
                breakdown["conference_boundary"] = breakdown.get("conference_boundary", 0) + pts

        # Golden boot leadership change
        if before.golden_boot_leader != after.golden_boot_leader:
            pts = 1.0
            score += pts
            breakdown["golden_boot_change"] = pts

        # Position swings (smaller bonus per position moved)
        total_pos_swing = pos_change(scoring_team) + pos_change(conceding_team)
        pos_pts = total_pos_swing * 0.15
        score += pos_pts
        breakdown["position_swings"] = pos_pts

        # Late-goal multiplier (80'+ = 1.5x, 90'+ = 2x)
        # Applied in narrative, not score, to keep comparisons clean

        return round(score, 2), breakdown

    def _narrate_chaos(
        self,
        scorer: str,
        team: str,
        opponent: str,
        minute: int,
        havoc_score: float,
        breakdown: dict,
        score_str: str,
    ) -> str:
        reasons = []
        if breakdown.get("top4_boundary"):
            reasons.append("flipped a Top 4 boundary")
        if breakdown.get("relegation_boundary"):
            reasons.append("crossed a relegation line")
        if breakdown.get("europa_boundary"):
            reasons.append("shifted a European spot")
        if breakdown.get("conference_boundary"):
            reasons.append("moved a Conference League place")
        if breakdown.get("golden_boot_change"):
            reasons.append("changed the Golden Boot leader")

        reason_str = " and ".join(reasons) if reasons else "sent ripples across the table"
        late = " In stoppage time." if minute >= 90 else f" At {minute}'." if minute >= 80 else f" At {minute}'."

        return (
            f"{scorer} for {team} vs {opponent}.{late} "
            f"Score: {score_str}. This goal {reason_str}. "
            f"Havoc score: {havoc_score:.1f}."
        )

    def get_most_chaotic_goal(self) -> ChaosScore | None:
        return self.top_chaos_goals[0] if self.top_chaos_goals else None

    def get_top_n(self, n: int = 10) -> list[ChaosScore]:
        return self.top_chaos_goals[:n]
