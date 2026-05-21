"""
Position Spread Calculator.
For each club, computes the range of final league positions still
mathematically possible given live scores across all 10 MW38 fixtures.

3^10 = 59,049 permutations — fast enough to run on every significant event.
"""

from dataclasses import dataclass, field
from itertools import product

from live_ingestion import LiveMatchState
from config import PRE_MATCH_STANDINGS


@dataclass
class ClubSpread:
    team: str
    current_points: int
    current_gd: int
    current_position: int
    min_position: int        # best possible finish
    max_position: int        # worst possible finish
    min_points: int          # points if all remaining results go their way
    max_points: int
    locked: bool             # position is mathematically certain
    cl_possible: bool        # can still finish top 5
    cl_certain: bool         # guaranteed top 5 regardless of other results
    relegated_possible: bool
    relegated_certain: bool
    # position → probability (0.0–1.0), only non-zero entries
    position_distribution: dict[int, float] = field(default_factory=dict)
    # Which result combos produce each extreme (empty if locked)
    best_case_scenario: list[str] = field(default_factory=list)
    worst_case_scenario: list[str] = field(default_factory=list)
    # position → up to 5 example result combos that produce that position
    position_scenarios: dict[int, list[list[str]]] = field(default_factory=dict)


def compute_spreads(
    match_states: dict[int, LiveMatchState],
) -> dict[str, ClubSpread]:
    """
    Main entry point. Takes all 10 live match states,
    enumerates possible final results, returns spread per team.
    """
    # Build base points/gd from pre-season standings + live adjustments
    base_points: dict[str, int] = {}
    base_gd: dict[str, int] = {}
    base_gf: dict[str, int] = {}

    for team, data in PRE_MATCH_STANDINGS.items():
        base_points[team] = data.get("points", 0)
        base_gd[team] = data.get("gd", 0)
        base_gf[team] = data.get("gf", 0)

    # Apply goals already scored in live matches
    for state in match_states.values():
        _apply_live_goals(state, base_gf, base_gd)

    # Separate finished matches from in-progress
    finished: list[LiveMatchState] = []
    live: list[LiveMatchState] = []

    for state in match_states.values():
        if state.status == "FT":
            finished.append(state)
        else:
            live.append(state)

    # Apply finished match points — locked in
    committed_points = dict(base_points)
    for state in finished:
        _apply_result_points(state, committed_points)

    # Enumerate possible outcomes for remaining live matches
    # Each match: 0=home_win, 1=draw, 2=away_win
    outcomes = list(product(range(3), repeat=len(live)))

    # Per-team: frequency count across all permutations (position → count)
    position_freq: dict[str, dict[int, int]] = {t: {} for t in committed_points}
    best_scenarios: dict[str, list[str]] = {t: [] for t in committed_points}
    worst_scenarios: dict[str, list[str]] = {t: [] for t in committed_points}
    best_pos_seen: dict[str, int] = {t: 21 for t in committed_points}
    worst_pos_seen: dict[str, int] = {t: 0 for t in committed_points}
    # position → list of example scenario strings (capped at 5 per position per team)
    pos_scenarios: dict[str, dict[int, list[list[str]]]] = {t: {} for t in committed_points}
    _MAX_EXAMPLES = 5

    total_permutations = len(outcomes)

    # ── Pass 1 (probability): W/D/L with ±1 GD — fast, used for distribution ──
    for outcome_combo in outcomes:
        perm_points = dict(committed_points)
        perm_gd = dict(base_gd)
        perm_gf = dict(base_gf)
        scenario_desc = []

        for i, outcome in enumerate(outcome_combo):
            state = live[i]
            home = state.home
            away = state.away

            if outcome == 0:  # home win
                perm_points[home] = perm_points.get(home, 0) + 3
                perm_gd[home] = perm_gd.get(home, 0) + 1
                perm_gd[away] = perm_gd.get(away, 0) - 1
                perm_gf[home] = perm_gf.get(home, 0) + 1
                scenario_desc.append(f"{home} W")
            elif outcome == 1:  # draw
                perm_points[home] = perm_points.get(home, 0) + 1
                perm_points[away] = perm_points.get(away, 0) + 1
                scenario_desc.append(f"{home} D")
            else:  # away win
                perm_points[away] = perm_points.get(away, 0) + 3
                perm_gd[away] = perm_gd.get(away, 0) + 1
                perm_gd[home] = perm_gd.get(home, 0) - 1
                perm_gf[away] = perm_gf.get(away, 0) + 1
                scenario_desc.append(f"{away} W")

        sorted_teams = _sort_table(perm_points, perm_gd, perm_gf)
        positions = {team: i + 1 for i, team in enumerate(sorted_teams)}

        for team in committed_points:
            pos = positions.get(team, 20)
            position_freq[team][pos] = position_freq[team].get(pos, 0) + 1

            if pos < best_pos_seen[team]:
                best_pos_seen[team] = pos
                best_scenarios[team] = list(scenario_desc)
            if pos > worst_pos_seen[team]:
                worst_pos_seen[team] = pos
                worst_scenarios[team] = list(scenario_desc)

            # Store up to _MAX_EXAMPLES full scenario combos per position
            bucket = pos_scenarios[team].setdefault(pos, [])
            if len(bucket) < _MAX_EXAMPLES:
                bucket.append(list(scenario_desc))

    # ── Pass 2 (min/max): extreme GD margins to find true reachable positions ──
    # A team can win 10-0 or lose 0-10; ±1 GD misses GD-tiebreaker overturns.
    # We use ±10 GD for wins/losses to cover all realistic scorelines.
    _EXTREME_GD = 10
    extreme_best: dict[str, int] = dict(best_pos_seen)  # start from pass-1 values
    extreme_worst: dict[str, int] = dict(worst_pos_seen)

    for outcome_combo in outcomes:
        perm_points = dict(committed_points)
        perm_gd = dict(base_gd)
        perm_gf = dict(base_gf)

        for i, outcome in enumerate(outcome_combo):
            state = live[i]
            home = state.home
            away = state.away

            if outcome == 0:  # home win — apply maximum margin
                perm_points[home] = perm_points.get(home, 0) + 3
                perm_gd[home] = perm_gd.get(home, 0) + _EXTREME_GD
                perm_gd[away] = perm_gd.get(away, 0) - _EXTREME_GD
                perm_gf[home] = perm_gf.get(home, 0) + _EXTREME_GD
            elif outcome == 1:  # draw — GD unchanged
                perm_points[home] = perm_points.get(home, 0) + 1
                perm_points[away] = perm_points.get(away, 0) + 1
            else:  # away win
                perm_points[away] = perm_points.get(away, 0) + 3
                perm_gd[away] = perm_gd.get(away, 0) + _EXTREME_GD
                perm_gd[home] = perm_gd.get(home, 0) - _EXTREME_GD
                perm_gf[away] = perm_gf.get(away, 0) + _EXTREME_GD

        sorted_teams = _sort_table(perm_points, perm_gd, perm_gf)
        positions = {team: i + 1 for i, team in enumerate(sorted_teams)}

        for team in committed_points:
            pos = positions.get(team, 20)
            if pos < extreme_best[team]:
                extreme_best[team] = pos
            if pos > extreme_worst[team]:
                extreme_worst[team] = pos

    # Build ClubSpread objects
    current_table = _sort_table(
        committed_points,
        {t: base_gd.get(t, 0) for t in committed_points},
        {t: base_gf.get(t, 0) for t in committed_points},
    )
    current_positions = {team: i + 1 for i, team in enumerate(current_table)}

    spreads: dict[str, ClubSpread] = {}

    for team in committed_points:
        freq = position_freq.get(team, {})
        # Use extreme-GD pass for true min/max; fall back to frequency keys if no live matches
        min_pos = extreme_best.get(team, min(freq.keys()) if freq else current_positions.get(team, 10))
        max_pos = extreme_worst.get(team, max(freq.keys()) if freq else current_positions.get(team, 10))

        max_pts = max(
            committed_points.get(team, 0) + _max_remaining_points(team, live),
            committed_points.get(team, 0),
        )
        min_pts = committed_points.get(team, 0)

        # Normalise frequency → probability
        distribution = {
            pos: count / total_permutations
            for pos, count in freq.items()
        }

        is_locked = (min_pos == max_pos)
        spreads[team] = ClubSpread(
            team=team,
            current_points=committed_points.get(team, 0),
            current_gd=base_gd.get(team, 0),
            current_position=current_positions.get(team, 10),
            min_position=min_pos,
            max_position=max_pos,
            min_points=min_pts,
            max_points=max_pts,
            locked=is_locked,
            cl_possible=min_pos <= 6,
            cl_certain=max_pos <= 6,
            relegated_possible=max_pos >= 18,
            relegated_certain=min_pos >= 18,
            position_distribution=distribution,
            # Sealed positions need no best/worst — it's done and dusted
            best_case_scenario=[] if is_locked else best_scenarios.get(team, []),
            worst_case_scenario=[] if is_locked else worst_scenarios.get(team, []),
            position_scenarios=pos_scenarios.get(team, {}),
        )

    return spreads


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _apply_live_goals(state: LiveMatchState, gf: dict, gd: dict):
    gf[state.home] = gf.get(state.home, 0) + state.home_goals
    gf[state.away] = gf.get(state.away, 0) + state.away_goals
    gd[state.home] = gd.get(state.home, 0) + state.home_goals - state.away_goals
    gd[state.away] = gd.get(state.away, 0) + state.away_goals - state.home_goals


def _apply_result_points(state: LiveMatchState, points: dict):
    if state.home_goals > state.away_goals:
        points[state.home] = points.get(state.home, 0) + 3
    elif state.away_goals > state.home_goals:
        points[state.away] = points.get(state.away, 0) + 3
    else:
        points[state.home] = points.get(state.home, 0) + 1
        points[state.away] = points.get(state.away, 0) + 1


def _sort_table(points: dict, gd: dict, gf: dict) -> list[str]:
    return sorted(
        points.keys(),
        key=lambda t: (points.get(t, 0), gd.get(t, 0), gf.get(t, 0)),
        reverse=True,
    )


def _max_remaining_points(team: str, live_states: list[LiveMatchState]) -> int:
    bonus = 0
    for state in live_states:
        if team in (state.home, state.away) and state.status != "FT":
            bonus += 3
    return bonus


def spreads_to_json(spreads: dict[str, ClubSpread]) -> list[dict]:
    """Sorted by current position for the table view."""
    sorted_teams = sorted(spreads.values(), key=lambda s: s.current_position)
    return [
        {
            "team": s.team,
            "current_position": s.current_position,
            "current_points": s.current_points,
            "current_gd": s.current_gd,
            "min_position": s.min_position,
            "max_position": s.max_position,
            "min_points": s.min_points,
            "max_points": s.max_points,
            "locked": s.locked,
            "cl_possible": s.cl_possible,
            "cl_certain": s.cl_certain,
            "relegated_possible": s.relegated_possible,
            "relegated_certain": s.relegated_certain,
            "best_case": s.best_case_scenario,
            "worst_case": s.worst_case_scenario,
            "spread_width": s.max_position - s.min_position,
            # Keyed by string for JSON; position → probability 0.0–1.0
            "position_distribution": {
                str(pos): round(prob, 4)
                for pos, prob in s.position_distribution.items()
            },
            # position → up to 5 example result combos (empty for locked teams)
            "position_scenarios": {
                str(pos): examples
                for pos, examples in s.position_scenarios.items()
            } if not s.locked else {},
        }
        for s in sorted_teams
    ]
