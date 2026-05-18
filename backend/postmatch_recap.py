"""
Full-time season recap generator.
Called when all 10 MW38 fixtures reach FT status.
Produces the final table, confirmed European spots, relegation,
awards, and an Omniscient narrative summary.
"""

from omniscient_engine import OmniscientEngine
from live_ingestion import LiveMatchState


EUROPEAN_LABELS = {
    1: "🏆 Premier League CHAMPIONS",
    2: "🏆 Champions League",
    3: "🏆 Champions League",
    4: "🏆 Champions League",
    5: "🏆 Champions League",
    6: "🔵 Europa League",
    7: "🟠 Conference League",
}

RELEGATION_POSITIONS = {18, 19, 20}


def build_final_recap(engine: OmniscientEngine, match_states: dict[int, LiveMatchState]) -> dict:
    table = engine.get_live_table()
    golden_boot = engine.get_golden_boot_standings()

    final_table = []
    champions = None
    european_spots = []
    relegated_teams = []

    for i, team_standing in enumerate(table):
        pos = i + 1
        label = EUROPEAN_LABELS.get(pos, "")
        is_relegated = pos in RELEGATION_POSITIONS

        entry = {
            "position": pos,
            "team": team_standing.team,
            "points": team_standing.total_points,
            "gd": team_standing.total_gd,
            "gf": team_standing.total_gf,
            "label": label,
            "relegated": is_relegated,
        }
        final_table.append(entry)

        if pos == 1:
            champions = team_standing.team
        if label:
            european_spots.append({"position": pos, "team": team_standing.team, "competition": label})
        if is_relegated:
            relegated_teams.append(team_standing.team)

    # MW38 results
    mw38_results = []
    for state in match_states.values():
        if state.status == "FT":
            mw38_results.append({
                "home": state.home,
                "away": state.away,
                "home_goals": state.home_goals,
                "away_goals": state.away_goals,
                "result": (
                    "home_win" if state.home_goals > state.away_goals
                    else "away_win" if state.away_goals > state.home_goals
                    else "draw"
                ),
            })

    # Biggest result of the day
    biggest_swing = max(
        mw38_results,
        key=lambda r: abs(r["home_goals"] - r["away_goals"]),
        default=None,
    )

    # Liverpool-specific narrative
    lfc_entry = next((t for t in final_table if t["team"] == "Liverpool"), None)
    if lfc_entry:
        if lfc_entry["position"] <= 5:
            lfc_narrative = (
                f"Liverpool finish {_ordinal(lfc_entry['position'])}. "
                f"Champions League football confirmed. "
                f"The Kop gets what it deserves."
            )
        elif lfc_entry["position"] == 6:
            lfc_narrative = (
                f"Liverpool finish 6th. Europa League. "
                f"Close, so close. The gap was just too much."
            )
        else:
            lfc_narrative = (
                f"Liverpool finish {_ordinal(lfc_entry['position'])}. "
                f"No European football. A rebuilding summer ahead."
            )
    else:
        lfc_narrative = ""

    # Golden Boot winner
    gb_winner = golden_boot[0] if golden_boot else None

    # Season narrative
    season_narrative = _write_season_narrative(
        champions, european_spots, relegated_teams, gb_winner, lfc_narrative
    )

    return {
        "final_table": final_table,
        "mw38_results": mw38_results,
        "champions": champions,
        "european_spots": european_spots,
        "relegated": relegated_teams,
        "golden_boot_winner": gb_winner,
        "biggest_result": biggest_swing,
        "liverpool_narrative": lfc_narrative,
        "season_narrative": season_narrative,
    }


def _write_season_narrative(champions, european_spots, relegated, gb_winner, lfc_narrative) -> str:
    parts = []

    if champions:
        parts.append(f"{champions} are CHAMPIONS. The title is theirs.")

    cl_teams = [e["team"] for e in european_spots if "Champions League" in e["competition"]]
    if cl_teams:
        parts.append(f"Champions League: {', '.join(cl_teams)}.")

    el_teams = [e["team"] for e in european_spots if "Europa" in e["competition"]]
    if el_teams:
        parts.append(f"Europa League: {', '.join(el_teams)}.")

    conf_teams = [e["team"] for e in european_spots if "Conference" in e["competition"]]
    if conf_teams:
        parts.append(f"Conference League: {', '.join(conf_teams)}.")

    if relegated:
        parts.append(f"Relegated: {', '.join(relegated)}. Season over. Start again.")

    if gb_winner:
        parts.append(
            f"Golden Boot: {gb_winner['player']} ({gb_winner['team']}) — {gb_winner['goals']} goals."
        )

    if lfc_narrative:
        parts.append(lfc_narrative)

    return " ".join(parts)


def build_fpl_recap(fpl_standings: list[dict]) -> dict:
    if not fpl_standings:
        return {}

    winner = fpl_standings[0]
    last = fpl_standings[-1]

    # Who had the best GW38
    best_gw = max(fpl_standings, key=lambda m: m["gw_points"])
    worst_gw = min(fpl_standings, key=lambda m: m["gw_points"])

    return {
        "winner": {
            "manager": winner["manager"],
            "team_name": winner["team_name"],
            "total": winner["total"],
            "gw_points": winner["gw_points"],
        },
        "runner_up": fpl_standings[1] if len(fpl_standings) > 1 else None,
        "last_place": {
            "manager": last["manager"],
            "team_name": last["team_name"],
            "total": last["total"],
        },
        "best_gw38": {
            "manager": best_gw["manager"],
            "points": best_gw["gw_points"],
            "captain": best_gw["captain"],
        },
        "worst_gw38": {
            "manager": worst_gw["manager"],
            "points": worst_gw["gw_points"],
        },
        "full_standings": fpl_standings,
        "narrative": (
            f"Brooklyn OLSC Fantasy: {winner['manager']} wins the league "
            f"({winner['total']} points). "
            f"Best GW38: {best_gw['manager']} ({best_gw['gw_points']}pts, "
            f"captained {best_gw['captain']}). "
            f"Wooden spoon: {last['manager']}."
        ),
    }


def all_matches_finished(match_states: dict) -> bool:
    return all(s.status == "FT" for s in match_states.values())


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")
