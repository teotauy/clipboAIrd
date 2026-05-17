import os
import json
from pathlib import Path

API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY", "")
API_FOOTBALL_BASE = "https://v3.football.api-sports.io"

DELPHI_WEBHOOK_URL = os.environ.get("DELPHI_WEBHOOK_URL", "")
DELPHI_API_KEY = os.environ.get("DELPHI_API_KEY", "")

PL_LEAGUE_ID = 39
PL_SEASON = 2025  # 2025/26 season

# ─── Load season state (written by stage_setup.py after MW37) ─────────────────

_STATE_PATH = Path(__file__).parent / "season_state.json"

def _load_state() -> dict:
    if _STATE_PATH.exists():
        return json.loads(_STATE_PATH.read_text())
    return {}

_state = _load_state()

def reload_state():
    """Call this if season_state.json is updated without restarting."""
    global _state
    _state = _load_state()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

MATCHWEEK_38_FIXTURE_IDS: list[dict] = _state.get("fixtures", [
    # Fallback stubs — replaced by stage_setup.py
    {"id": 0, "home": "Liverpool",     "away": "Aston Villa"},
    {"id": 0, "home": "Arsenal",       "away": "Everton"},
    {"id": 0, "home": "Man City",      "away": "Southampton"},
    {"id": 0, "home": "Newcastle",     "away": "Chelsea"},
    {"id": 0, "home": "Man United",    "away": "Fulham"},
    {"id": 0, "home": "Tottenham",     "away": "Brighton"},
    {"id": 0, "home": "West Ham",      "away": "Bournemouth"},
    {"id": 0, "home": "Wolves",        "away": "Crystal Palace"},
    {"id": 0, "home": "Nottm Forest",  "away": "Burnley"},
    {"id": 0, "home": "Brentford",     "away": "Luton"},
])


# ─── Standings after MW37 ─────────────────────────────────────────────────────

PRE_MATCH_STANDINGS: dict = _state.get("standings", {})


# ─── Awards races ─────────────────────────────────────────────────────────────

GOLDEN_BOOT_RACE: dict = _state.get("golden_boot", {})
PLAYMAKER_RACE: dict = _state.get("playmaker", {})


# ─── Relegation ───────────────────────────────────────────────────────────────

RELEGATION_ZONE_TEAMS: list[str] = _state.get("relegation_zone", [])


# ─── Pre-match narrative (fed to Delphi as opening context) ───────────────────

PRE_MATCH_NARRATIVE: str = _state.get(
    "narrative_context",
    "Matchweek 38. Everything is still to play for.",
)


# ─── State health check ───────────────────────────────────────────────────────

def is_staged() -> bool:
    """Returns True if stage_setup.py has been run and data is loaded."""
    return bool(_state) and any(f["id"] != 0 for f in MATCHWEEK_38_FIXTURE_IDS)

def staged_at() -> str | None:
    return _state.get("fetched_at")
