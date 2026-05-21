"""
Pre-match preview generator for Matchweek 38.
Builds a stakes-driven narrative for each of the 10 simultaneous fixtures
before kick-off, plus an overall "day at a glance" summary.
"""

from config import PRE_MATCH_STANDINGS, MATCHWEEK_38_FIXTURE_IDS, GOLDEN_BOOT_RACE, RELEGATION_ZONE_TEAMS


EUROPEAN_SPOTS = {
    "champions_league": 5,
    "europa_league": 7,
    "conference_league_qualifier": 8,
}

# Golden boot: only show players within this many goals of the leader
_BOOT_REALISTIC_GAP = 5


def _is_position_locked(team: str, standings: dict) -> bool:
    """True if this team's final position is already mathematically certain."""
    data = standings.get(team, {})
    pos = data.get("position", 99)
    pts = data.get("points", 0)

    # Can the team above overtake us?
    above = next(
        (t for t, d in standings.items() if d.get("position") == pos - 1), None
    )
    # Can the team below catch us?
    below = next(
        (t for t, d in standings.items() if d.get("position") == pos + 1), None
    )

    above_pts_max = standings.get(above, {}).get("points", 0) + 3 if above else -1
    below_pts_max = standings.get(below, {}).get("points", 0) + 3 if below else -1

    cant_be_overtaken = below_pts_max < pts or below is None
    cant_catch_above = above_pts_max > pts + 3 or above is None  # nowhere higher to go

    return cant_be_overtaken and cant_catch_above


def _is_relegated_certain(team: str, standings: dict) -> bool:
    """True if this team cannot escape the bottom three regardless of results."""
    pts = standings.get(team, {}).get("points", 0)
    our_max = pts + 3  # best case: we win
    # Find 17th place (last safe spot)
    seventeenth = next(
        (d.get("points", 0) for d in standings.values() if d.get("position") == 17), None
    )
    if seventeenth is None:
        return False
    # Even if 17th loses, they keep their points; we can't reach them
    return our_max < seventeenth


def _classify_stakes(home: str, away: str, standings: dict) -> list[str]:
    stakes = []

    home_data = standings.get(home, {})
    away_data = standings.get(away, {})

    for team, data in [(home, home_data), (away, away_data)]:
        pos = data.get("position", 99)
        locked = _is_position_locked(team, standings)

        if pos >= 18:
            if _is_relegated_certain(team, standings):
                stakes.append(f"{team} relegated — nothing to play for but pride")
            else:
                stakes.append(f"{team} IN THE RELEGATION ZONE (pos {pos}) — must win")
        elif pos == 17:
            stakes.append(f"{team} one place above the drop — danger")
        elif pos <= 5:
            if locked:
                zone = (
                    "Champions" if pos == 1
                    else "Champions League" if pos <= 5
                    else "Europa League"
                )
                stakes.append(f"{team} locked into {pos}{_ordinal(pos)} — {zone} confirmed")
            else:
                stakes.append(f"{team} in Champions League contention (currently {pos})")
        elif pos <= 7:
            if locked:
                stakes.append(f"{team} locked into {pos}{_ordinal(pos)} — Europa League confirmed")
            else:
                stakes.append(f"{team} in Europa League contention (pos {pos})")
        elif pos == 8:
            if locked:
                stakes.append(f"{team} locked into 8th — Conference League qualifier confirmed")
            else:
                stakes.append(f"{team} holding Conference League qualifier spot (pos 8)")

    return stakes if stakes else ["Pride and contracts on the line for both sides"]


def _ordinal(n: int) -> str:
    if 11 <= n <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def build_fixture_preview(fixture: dict, standings: dict, golden_boot: dict) -> dict:
    home = fixture["home"]
    away = fixture["away"]
    stakes = _classify_stakes(home, away, standings)

    home_pts = standings.get(home, {}).get("points", "?")
    away_pts = standings.get(away, {}).get("points", "?")
    home_pos = standings.get(home, {}).get("position", "?")
    away_pos = standings.get(away, {}).get("position", "?")

    # Only show Golden Boot contenders who are realistically in the race
    leader_goals = max((d["goals"] for d in golden_boot.values()), default=0)
    boot_watch = [
        f"{p} ({d['team']}, {d['goals']} goals)"
        for p, d in golden_boot.items()
        if d["team"] in [home, away]
        and leader_goals - d["goals"] <= _BOOT_REALISTIC_GAP
    ]

    narrative = _write_fixture_narrative(home, away, home_pos, away_pos, home_pts, away_pts, stakes)

    return {
        "home": home,
        "away": away,
        "home_position": home_pos,
        "away_position": away_pos,
        "home_points": home_pts,
        "away_points": away_pts,
        "stakes": stakes,
        "golden_boot_watch": boot_watch,
        "narrative": narrative,
    }


def _write_fixture_narrative(home, away, home_pos, away_pos, home_pts, away_pts, stakes) -> str:
    stakes_str = ". ".join(stakes)
    return (
        f"{home} (#{home_pos}, {home_pts}pts) vs {away} (#{away_pos}, {away_pts}pts). "
        f"{stakes_str}."
    )


def build_full_preview(standings: dict, golden_boot: dict, spreads: dict | None = None) -> dict:
    fixtures_preview = [
        build_fixture_preview(f, standings, golden_boot)
        for f in MATCHWEEK_38_FIXTURE_IDS
    ]

    # Build the "day at a glance" summary
    cl_contenders = [t for t, d in standings.items() if d.get("position", 99) <= 6]
    relegation_threatened = [t for t in RELEGATION_ZONE_TEAMS]

    boot_leader = max(golden_boot.items(), key=lambda x: x[1]["goals"], default=(None, {}))
    boot_str = (
        f"{boot_leader[0]} ({boot_leader[1]['goals']} goals) leads the Golden Boot"
        if boot_leader[0] else "Golden Boot race is open"
    )

    day_summary = (
        f"Matchweek 38. Everything on the line. "
        f"Champions League places {', '.join(cl_contenders[:6])} are all in play. "
        f"{boot_str}. "
        f"Survival fight: {', '.join(relegation_threatened)}. "
        f"All 10 matches kick off simultaneously at 16:00 BST. "
        f"Nothing is settled. Everything is possible. Good luck."
    )

    played_counts = [d.get("played", 37) for d in standings.values()]
    standings_incomplete = bool(played_counts) and min(played_counts) < max(played_counts)

    # Golden Boot: only realistic contenders (within _BOOT_REALISTIC_GAP of leader)
    leader_goals = max((d["goals"] for d in golden_boot.values()), default=0)
    realistic_boot = [
        {"player": p, "team": d["team"], "goals": d["goals"]}
        for p, d in sorted(golden_boot.items(), key=lambda x: x[1]["goals"], reverse=True)
        if leader_goals - d["goals"] <= _BOOT_REALISTIC_GAP
    ]

    # European contenders: teams that can still finish 1–8 (using spread data if available)
    if spreads:
        europe_contenders = sorted(
            [
                {
                    "team": s["team"],
                    "position": s["current_position"],
                    "points": s["current_points"],
                    "min_position": s["min_position"],
                    "max_position": s["max_position"],
                    "locked": s.get("locked", False),
                }
                for s in spreads
                if s["min_position"] <= 8
            ],
            key=lambda x: x["position"],
        )
    else:
        europe_contenders = [
            {"team": t, "position": d.get("position", 99), "points": d.get("points", 0),
             "min_position": d.get("position", 99), "max_position": d.get("position", 99), "locked": False}
            for t, d in sorted(standings.items(), key=lambda x: x[1].get("position", 99))
            if d.get("position", 99) in range(1, 9)
        ]

    # Playoff note: Liverpool and Bournemouth could be equal on every tiebreaker
    playoff_note = None
    liv = standings.get("Liverpool", {})
    bou = standings.get("Bournemouth", {})
    if (
        liv.get("points") == bou.get("points") + 3  # Liverpool wins = same if Bournemouth wins
        or abs(liv.get("points", 0) - bou.get("points", 0)) <= 3
    ):
        if liv.get("gd") == bou.get("gd") or abs(liv.get("gd", 0) - bou.get("gd", 0)) <= 6:
            playoff_note = (
                "⚠ Playoff possible: if Liverpool lose 1–0 and Bournemouth win 5–0, "
                "they match on points, GD, GF, and H2H — triggering a one-legged "
                "neutral-venue playoff for 5th (Champions League)."
            )

    return {
        "day_summary": day_summary,
        "standings_incomplete": standings_incomplete,
        "playoff_note": playoff_note,
        "fixtures": fixtures_preview,
        "key_battles": {
            "europe": europe_contenders,
            "golden_boot": realistic_boot,
            "relegation": sorted(
                [
                    {"team": t, "points": d.get("points", 0), "position": d.get("position", 20)}
                    for t, d in standings.items()
                    if d.get("points", 0) <= max(
                        (v.get("points", 0) + 3)
                        for v in standings.values()
                        if v.get("position", 99) >= 18
                    )
                ],
                key=lambda x: x["position"],
            ),
        },
    }
