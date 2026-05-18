"""
Stage Setup — run this after Matchweek 37 is complete.

Fetches from API-Football:
  - MW38 fixture IDs for all 10 PL matches
  - Final standings after MW37 (points, GD, GF, position)
  - Top Scorers entering MW38 (Golden Boot race)
  - Relegation zone teams

Writes everything to season_state.json which the engine
loads at startup instead of the empty config stubs.

Usage:
    API_FOOTBALL_KEY=xxx python stage_setup.py
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime

import httpx

from config import API_FOOTBALL_KEY, API_FOOTBALL_BASE, PL_LEAGUE_ID, PL_SEASON

OUTPUT_PATH = Path(__file__).parent / "season_state.json"


async def fetch_mw38_fixtures(client: httpx.AsyncClient) -> list[dict]:
    print("→ Fetching MW38 fixtures...")
    resp = await client.get(
        f"{API_FOOTBALL_BASE}/fixtures",
        params={
            "league": PL_LEAGUE_ID,
            "season": PL_SEASON,
            "round": "Regular Season - 38",
        },
        headers={"x-apisports-key": API_FOOTBALL_KEY},
        timeout=15.0,
    )
    fixtures = resp.json().get("response", [])
    result = []
    for f in fixtures:
        result.append({
            "id": f["fixture"]["id"],
            "home": f["teams"]["home"]["name"],
            "away": f["teams"]["away"]["name"],
            "date": f["fixture"]["date"],
            "venue": f["fixture"]["venue"]["name"],
        })
    print(f"  Found {len(result)} fixtures")
    return result


async def fetch_standings(client: httpx.AsyncClient) -> dict:
    print("→ Fetching standings after MW37...")
    resp = await client.get(
        f"{API_FOOTBALL_BASE}/standings",
        params={"league": PL_LEAGUE_ID, "season": PL_SEASON},
        headers={"x-apisports-key": API_FOOTBALL_KEY},
        timeout=15.0,
    )
    data = resp.json().get("response", [])
    standings = {}

    if not data:
        print("  WARNING: No standings data returned")
        return standings

    league_standings = data[0]["league"]["standings"][0]
    for entry in league_standings:
        team = entry["team"]["name"]
        standings[team] = {
            "position": entry["rank"],
            "points": entry["points"],
            "gd": entry["goalsDiff"],
            "gf": entry["all"]["goals"]["for"],
            "played": entry["all"]["played"],
            "form": entry.get("form", ""),
        }

    print(f"  Found {len(standings)} teams")

    played_counts = [d["played"] for d in standings.values()]
    min_played = min(played_counts) if played_counts else 0
    max_played = max(played_counts) if played_counts else 0
    if min_played < max_played:
        behind = [t for t, d in standings.items() if d["played"] < max_played]
        print(f"  ⚠  Uneven matchweeks: {behind} have only played {min_played} (others at {max_played})")
        print(f"  ⚠  Re-run stage_setup.py once all MW{max_played} fixtures are complete.")

    return standings


async def fetch_top_scorers(client: httpx.AsyncClient) -> dict:
    print("→ Fetching top scorers (Golden Boot race)...")
    resp = await client.get(
        f"{API_FOOTBALL_BASE}/players/topscorers",
        params={"league": PL_LEAGUE_ID, "season": PL_SEASON},
        headers={"x-apisports-key": API_FOOTBALL_KEY},
        timeout=15.0,
    )
    data = resp.json().get("response", [])
    scorers = {}

    for entry in data[:15]:  # Top 15 entering final day
        player = entry["player"]["name"]
        team = entry["statistics"][0]["team"]["name"]
        goals = entry["statistics"][0]["goals"]["total"] or 0
        assists = entry["statistics"][0]["goals"]["assists"] or 0
        scorers[player] = {
            "team": team,
            "goals": goals,
            "assists": assists,
        }

    print(f"  Found {len(scorers)} scorers in race")
    return scorers


async def fetch_top_assisters(client: httpx.AsyncClient) -> dict:
    print("→ Fetching top assisters (Playmaker award)...")
    resp = await client.get(
        f"{API_FOOTBALL_BASE}/players/topassists",
        params={"league": PL_LEAGUE_ID, "season": PL_SEASON},
        headers={"x-apisports-key": API_FOOTBALL_KEY},
        timeout=15.0,
    )
    data = resp.json().get("response", [])
    assisters = {}

    for entry in data[:10]:
        player = entry["player"]["name"]
        team = entry["statistics"][0]["team"]["name"]
        assists = entry["statistics"][0]["goals"]["assists"] or 0
        assisters[player] = {"team": team, "assists": assists}

    print(f"  Found {len(assisters)} in assist race")
    return assisters


def derive_relegation_zone(standings: dict) -> list[str]:
    sorted_teams = sorted(standings.items(), key=lambda x: x[1]["position"])
    return [t for t, _ in sorted_teams[-3:]]


def build_narrative_context(standings: dict, fixtures: list[dict], scorers: dict) -> str:
    """Human-readable summary of what's at stake — fed to Delphi as pre-match context."""
    sorted_teams = sorted(standings.items(), key=lambda x: x[1]["position"])

    top6 = sorted_teams[:6]
    bottom4 = sorted_teams[-4:]

    top6_str = ", ".join(f"{t} ({d['points']}pts)" for t, d in top6)
    bottom_str = ", ".join(f"{t} ({d['points']}pts)" for t, d in bottom4)

    scorer_leader = sorted(scorers.items(), key=lambda x: x[1]["goals"], reverse=True)
    boot_str = (
        f"{scorer_leader[0][0]} ({scorer_leader[0][1]['team']}, {scorer_leader[0][1]['goals']} goals)"
        if scorer_leader else "TBC"
    )

    return (
        f"Entering Matchweek 38: "
        f"Top 6 — {top6_str}. "
        f"Relegation fight — {bottom_str}. "
        f"Golden Boot leader — {boot_str}. "
        f"All 10 matches kick off simultaneously. Nothing is settled."
    )


async def run():
    print(f"\n{'='*55}")
    print(f"  ANFIELD ORACLE — Stage Setup")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*55}\n")

    if not API_FOOTBALL_KEY:
        print("ERROR: API_FOOTBALL_KEY not set")
        return

    async with httpx.AsyncClient() as client:
        fixtures = await fetch_mw38_fixtures(client)
        await asyncio.sleep(0.5)  # Rate limit courtesy

        standings = await fetch_standings(client)
        await asyncio.sleep(0.5)

        scorers = await fetch_top_scorers(client)
        await asyncio.sleep(0.5)

        assisters = await fetch_top_assisters(client)

    relegation_zone = derive_relegation_zone(standings)
    narrative_context = build_narrative_context(standings, fixtures, scorers)

    state = {
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "season": PL_SEASON,
        "matchweek": 38,
        "fixtures": fixtures,
        "standings": standings,
        "golden_boot": scorers,
        "playmaker": assisters,
        "relegation_zone": relegation_zone,
        "narrative_context": narrative_context,
    }

    OUTPUT_PATH.write_text(json.dumps(state, indent=2))
    print(f"\n✓ Written to {OUTPUT_PATH}")
    print(f"\n  Fixtures found:  {len(fixtures)}")
    print(f"  Teams in table:  {len(standings)}")
    print(f"  Golden Boot top: {list(scorers.keys())[:3]}")
    print(f"  Relegation zone: {relegation_zone}")
    print(f"\n  Pre-match narrative:")
    print(f"  {narrative_context[:120]}...")
    print(f"\n{'='*55}")
    print("  Ready for match day. YNWA.")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    asyncio.run(run())
