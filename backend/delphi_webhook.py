"""
Delphi Digital Double webhook integration.
Packages the Omniscient Engine state into the payload schema
and pushes it to the Delphi API for persona-aware responses.
"""

import time
from datetime import datetime, timezone

import httpx

from config import DELPHI_WEBHOOK_URL, DELPHI_API_KEY
from omniscient_engine import OmniscientEngine
from live_ingestion import MatchEvent, LiveMatchState


# ─── DELPHI WEBHOOK PAYLOAD SCHEMA ───────────────────────────────────────────
#
# {
#   "timestamp": "2026-05-25T16:45:00Z",
#   "match_minute": 78,
#   "context_type": "live_matchweek_38",
#   "persona_id": "colby-angus-black",
#   "state": {
#     "live_table": [...],
#     "top_4_race": {
#       "top_4": [...],
#       "liverpool_position": 4,
#       "liverpool_in_cl": true,
#       "gap_to_fourth": 0
#     },
#     "golden_boot": [...],
#     "relegation": [...],
#     "anfield_sentiment": 0.72,
#     "butterfly_effects": [...]
#   },
#   "narrative_summary": "Liverpool currently in 4th on GD. Arsenal's...",
#   "instruction": "You are Colby Angus Black — Brooklyn OLSC member, Kop of Coffee writer. React to questions using this live data with emotional authenticity. Be chaotic, hopeful, and statistically sharp."
# }


DELPHI_INSTRUCTION = (
    "You are Colby Angus Black — Brooklyn OLSC member, Kop of Coffee writer, "
    "lifelong Liverpool supporter. You have access to LIVE Matchweek 38 data. "
    "When users ask you questions, answer using this real-time data combined with "
    "your persona: emotionally authentic, chaotically hopeful, statistically sharp, "
    "and dripping with gallows humor when things go wrong. Reference specific "
    "match minutes, butterfly effects, and Anfield sentiment. Never be neutral."
)


def build_delphi_payload(
    engine: OmniscientEngine,
    match_minute: int = 0,
    event: MatchEvent | None = None,
    match_state: LiveMatchState | None = None,
    live_narrative: str = "",
) -> dict:
    from narrative import build_narrative

    state = engine.get_full_state_snapshot()

    if event and match_state and not live_narrative:
        live_narrative = build_narrative(event, match_state, engine)

    if not live_narrative:
        live_narrative = _generate_narrative_summary(state)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "match_minute": match_minute,
        "context_type": "live_matchweek_38",
        "persona_id": "colby-angus-black",
        "trigger_event": event.type if event else "poll",
        "trigger_detail": event.detail if event else None,
        "state": state,
        "narrative_summary": live_narrative,
        "instruction": DELPHI_INSTRUCTION,
    }


def _generate_narrative_summary(state: dict) -> str:
    top4 = state["top_4_race"]
    sentiment = state["anfield_sentiment"]

    if top4["liverpool_in_cl"]:
        lfc_status = f"Liverpool in {top4['liverpool_position']}th. Holding on."
    else:
        gap = top4['gap_to_fourth']
        pos = top4['liverpool_position']
        lfc_status = f"Liverpool in {pos}th, {gap} point{'s' if gap != 1 else ''} off fourth."

    if sentiment > 0.5:
        mood = "This could actually happen."
    elif sentiment > 0:
        mood = "Don't get comfortable."
    elif sentiment > -0.5:
        mood = "Not where we need to be."
    else:
        mood = "This is bad."

    return f"{lfc_status} {mood}"


async def push_to_delphi(payload: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            DELPHI_WEBHOOK_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {DELPHI_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
