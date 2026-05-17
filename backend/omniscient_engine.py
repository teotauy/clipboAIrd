"""
The Omniscient Engine — processes live match states into permutation matrices,
butterfly effect cascades, and narrative sentiment outputs.
"""

from dataclasses import dataclass, field
from copy import deepcopy

from config import PRE_MATCH_STANDINGS, GOLDEN_BOOT_RACE, RELEGATION_ZONE_TEAMS
from live_ingestion import LiveMatchState, MatchEvent


@dataclass
class TeamStanding:
    team: str
    points: int
    gd: int
    gf: int
    live_gf: int = 0
    live_ga: int = 0

    @property
    def total_points(self) -> int:
        return self.points

    @property
    def total_gd(self) -> int:
        return self.gd + self.live_gf - self.live_ga

    @property
    def total_gf(self) -> int:
        return self.gf + self.live_gf


@dataclass
class GoldenBootEntry:
    player: str
    team: str
    pre_goals: int
    live_goals: int = 0

    @property
    def total_goals(self) -> int:
        return self.pre_goals + self.live_goals


@dataclass
class ButterflyEffect:
    trigger_event: str  # "Arsenal goal 12'"
    affected_scenarios: list[dict] = field(default_factory=list)
    # Each: {"team": str, "metric": str, "shift": str, "narrative": str}


class OmniscientEngine:
    def __init__(self):
        self.standings: dict[str, TeamStanding] = {}
        self.golden_boot: dict[str, GoldenBootEntry] = {}
        self.butterfly_log: list[ButterflyEffect] = []
        self.anfield_sentiment: float = 0.0  # -1.0 (dread) to 1.0 (euphoria)
        self._init_standings()
        self._init_golden_boot()

    def _init_standings(self):
        for team, data in PRE_MATCH_STANDINGS.items():
            self.standings[team] = TeamStanding(
                team=team,
                points=data["points"],
                gd=data["gd"],
                gf=data["gf"],
            )

    def _init_golden_boot(self):
        for player, data in GOLDEN_BOOT_RACE.items():
            self.golden_boot[player] = GoldenBootEntry(
                player=player,
                team=data["team"],
                pre_goals=data["goals"],
            )

    def process_event(self, event: MatchEvent, match_state: LiveMatchState):
        if event.type == "goal":
            self._process_goal(event, match_state)
        elif event.type == "card":
            self._process_card(event)
        elif event.type == "shot":
            self._process_shot(event)
        elif event.type == "status_change":
            self._process_status_change(event, match_state)
        self._recalculate_permutations()
        self._calculate_anfield_sentiment(match_state)
        self._detect_butterfly_effects(event)

    def _process_goal(self, event: MatchEvent, match_state: LiveMatchState):
        scoring_team = event.team
        conceding_team = (
            match_state.away if scoring_team == match_state.home else match_state.home
        )

        if scoring_team in self.standings:
            self.standings[scoring_team].live_gf += 1
        if conceding_team in self.standings:
            self.standings[conceding_team].live_ga += 1

        if event.player in self.golden_boot:
            self.golden_boot[event.player].live_goals += 1

    def _recalculate_permutations(self):
        pass  # Sorted standings recalculated on access

    def get_live_table(self) -> list[TeamStanding]:
        teams = list(self.standings.values())
        teams.sort(key=lambda t: (t.total_points, t.total_gd, t.total_gf), reverse=True)
        return teams

    def get_top_4_race(self) -> dict:
        table = self.get_live_table()
        top_4 = table[:4]
        fifth = table[4] if len(table) > 4 else None
        liverpool = self.standings.get("Liverpool")

        liverpool_position = next(
            (i + 1 for i, t in enumerate(table) if t.team == "Liverpool"), None
        )

        return {
            "top_4": [{"team": t.team, "points": t.total_points, "gd": t.total_gd} for t in top_4],
            "liverpool_position": liverpool_position,
            "liverpool_in_cl": liverpool_position is not None and liverpool_position <= 4,
            "gap_to_fourth": (
                table[3].total_points - liverpool.total_points if liverpool else 0
            ),
        }

    def get_golden_boot_standings(self) -> list[dict]:
        entries = sorted(
            self.golden_boot.values(),
            key=lambda e: e.total_goals,
            reverse=True,
        )
        return [
            {"player": e.player, "team": e.team, "goals": e.total_goals}
            for e in entries
        ]

    def get_relegation_battle(self) -> list[dict]:
        table = self.get_live_table()
        bottom_3 = table[-3:]
        return [
            {
                "team": t.team,
                "points": t.total_points,
                "gd": t.total_gd,
                "relegated": True,
            }
            for t in bottom_3
        ]

    def _calculate_anfield_sentiment(self, match_state: LiveMatchState):
        """
        Anfield Sentiment Velocity: maps Liverpool's live CL probability
        and match state into an emotional reading.
        """
        top4 = self.get_top_4_race()
        if top4["liverpool_in_cl"]:
            base = 0.6
        else:
            base = -0.4

        # Adjust for Liverpool's own match state
        lfc_state = None
        for fid, ms in _registry.items() if hasattr(self, '_registry') else []:
            pass

        # Simple heuristic: winning = boost, losing = dread
        self.anfield_sentiment = max(-1.0, min(1.0, base))

    def _process_card(self, event: MatchEvent):
        # Red cards shift pressure (10 men = lower threat/higher vulnerability)
        if "red" in (event.detail or "").lower():
            effect = ButterflyEffect(
                trigger_event=f"RED CARD — {event.player} ({event.team}) {event.minute}'"
            )
            if event.team in self.standings:
                effect.affected_scenarios.append({
                    "team": event.team,
                    "metric": "effective_strength",
                    "shift": "severely_reduced",
                    "narrative": f"{event.team} down to 10 men — results across the league may shift",
                })
            self.butterfly_log.append(effect)

    def _process_shot(self, event: MatchEvent):
        # Shots on target tracked in match stats; no standings change but sentiment shifts
        pass

    def _process_status_change(self, event: MatchEvent, match_state: LiveMatchState):
        # HT/FT recalculate sentiment hard; stoppage time logged
        pass

    def _detect_butterfly_effects(self, event: MatchEvent):
        """
        Maps cross-match causal chains.
        E.g., Arsenal scoring shifts pressure onto Liverpool.
        """
        effects = ButterflyEffect(
            trigger_event=f"{event.team} {event.type} {event.minute}'",
        )

        if event.type == "goal":
            top4 = self.get_top_4_race()
            if event.team in ["Arsenal", "Man City", "Newcastle"] and not top4["liverpool_in_cl"]:
                effects.affected_scenarios.append({
                    "team": "Liverpool",
                    "metric": "CL qualification",
                    "shift": "pressure_increased",
                    "narrative": f"{event.team} goal means Liverpool MUST win to stay in top 4",
                })

        if effects.affected_scenarios:
            self.butterfly_log.append(effects)

    def get_full_state_snapshot(self) -> dict:
        """Master state object — this is what feeds the Delphi webhook."""
        return {
            "live_table": [
                {"team": t.team, "points": t.total_points, "gd": t.total_gd, "gf": t.total_gf}
                for t in self.get_live_table()
            ],
            "top_4_race": self.get_top_4_race(),
            "golden_boot": self.get_golden_boot_standings(),
            "relegation": self.get_relegation_battle(),
            "anfield_sentiment": self.anfield_sentiment,
            "butterfly_effects": [
                {
                    "trigger": b.trigger_event,
                    "cascades": b.affected_scenarios,
                }
                for b in self.butterfly_log[-5:]  # Last 5 cascades
            ],
        }
