"""
Pre-match preview generator for Matchweek 38.
Builds a stakes-driven narrative for each of the 10 simultaneous fixtures
before kick-off, plus an overall "day at a glance" summary.
"""

from config import PRE_MATCH_STANDINGS, MATCHWEEK_38_FIXTURE_IDS, GOLDEN_BOOT_RACE, RELEGATION_ZONE_TEAMS


EUROPEAN_SPOTS = {
    "champions_league": 4,
    "europa_league": 6,
    "conference_league": 7,
}


def _classify_stakes(home: str, away: str, standings: dict) -> list[str]:
    stakes = []

    home_data = standings.get(home, {})
    away_data = standings.get(away, {})

    for team, data in [(home, home_data), (away, away_data)]:
        pos = data.get("position", 99)
        if pos <= 4:
            stakes.append(f"{team} defending a Champions League spot (currently {pos})")
        elif pos == 5:
            stakes.append(f"{team} chasing 4th — one win could see them in the CL")
        elif pos <= 6:
            stakes.append(f"{team} in Europa League contention (pos {pos})")
        elif pos == 7:
            stakes.append(f"{team} holding Conference League place (pos {pos})")
        elif pos == 8:
            stakes.append(f"{team} one result away from European football")
        if pos >= 18:
            stakes.append(f"{team} IN THE RELEGATION ZONE (pos {pos}) — must win")
        elif pos == 17:
            stakes.append(f"{team} one place above the drop — danger")

    return stakes if stakes else [f"Pride and contracts on the line for both sides"]


def build_fixture_preview(fixture: dict, standings: dict, golden_boot: dict) -> dict:
    home = fixture["home"]
    away = fixture["away"]
    stakes = _classify_stakes(home, away, standings)

    home_pts = standings.get(home, {}).get("points", "?")
    away_pts = standings.get(away, {}).get("points", "?")
    home_pos = standings.get(home, {}).get("position", "?")
    away_pos = standings.get(away, {}).get("position", "?")

    # Check if any Golden Boot contender plays here
    boot_watch = [
        f"{p} ({d['team']}, {d['goals']} goals)" for p, d in golden_boot.items()
        if d["team"] in [home, away]
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


def build_full_preview(standings: dict, golden_boot: dict) -> dict:
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

    return {
        "day_summary": day_summary,
        "fixtures": fixtures_preview,
        "key_battles": {
            "europe": [
                {"team": t, "position": d.get("position", 99), "points": d.get("points", 0)}
                for t, d in sorted(standings.items(), key=lambda x: x[1].get("position", 99))
                if d.get("position", 99) in range(3, 8)
            ],
            "golden_boot": [
                {"player": p, "team": d["team"], "goals": d["goals"]}
                for p, d in sorted(golden_boot.items(), key=lambda x: x[1]["goals"], reverse=True)[:3]
            ],
            "relegation": sorted(
                [
                    {"team": t, "points": d.get("points", 0), "position": d.get("position", 20)}
                    for t, d in standings.items()
                    if d.get("position", 99) >= 15  # anyone close enough to be caught
                ],
                key=lambda x: x["position"],
            ),
        },
    }
