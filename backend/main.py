"""
Anfield Oracle — Matchweek 38 Omniscient Simulator
Main entry point: spins up the live ingestion service, wires it to the
Omniscient Engine, and pushes state to Delphi on every significant event.
"""

import asyncio

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from live_ingestion import LiveIngestionService, MatchEvent, LiveMatchState
from omniscient_engine import OmniscientEngine
from delphi_webhook import build_delphi_payload, push_to_delphi
from flowchart_generator import generate_all_flowcharts
from prematch_preview import build_full_preview
from postmatch_recap import build_final_recap, build_fpl_recap, all_matches_finished
from historical_chaos import SeasonChaosEngine
from spread_calculator import compute_spreads, spreads_to_json
from config import PRE_MATCH_STANDINGS, GOLDEN_BOOT_RACE, is_staged, staged_at, PRE_MATCH_NARRATIVE
from fpl_service import FPLService

app = FastAPI(title="Anfield Oracle", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = OmniscientEngine()
ingestion = LiveIngestionService(poll_interval=20.0)
fpl = FPLService()
_chaos_cache: dict | None = None
fpl_clients: list[WebSocket] = []

connected_clients: list[WebSocket] = []
delphi_clients: list[WebSocket] = []
spread_clients: list[WebSocket] = []


DELPHI_TRIGGER_TYPES = {"goal", "card", "shot", "status_change"}

def on_match_event(event: MatchEvent, match_state: LiveMatchState):
    engine.process_event(event, match_state)

    if event.type in DELPHI_TRIGGER_TYPES:
        asyncio.create_task(broadcast_spreads())

        # Goal → FPL impact
        if event.type == "goal" and event.player and fpl.ready:
            impact = fpl.get_goal_impact(event.player)
            if impact:
                asyncio.create_task(broadcast_fpl_impact(impact))

        payload = build_delphi_payload(
            engine,
            match_minute=event.minute,
            event=event,
            match_state=match_state,
        )
        asyncio.create_task(push_to_delphi(payload))
        asyncio.create_task(broadcast_delphi(payload))
        asyncio.create_task(broadcast_state())


async def broadcast_state():
    state = engine.get_full_state_snapshot()
    for ws in connected_clients[:]:
        try:
            await ws.send_json(state)
        except Exception:
            connected_clients.remove(ws)


async def broadcast_spreads():
    data = spreads_to_json(compute_spreads(ingestion.match_states))
    for ws in spread_clients[:]:
        try:
            await ws.send_json(data)
        except Exception:
            spread_clients.remove(ws)


async def broadcast_fpl_impact(impact: dict):
    data = {"type": "goal_impact", **impact, "standings": fpl.get_standings()}
    for ws in fpl_clients[:]:
        try:
            await ws.send_json(data)
        except Exception:
            fpl_clients.remove(ws)


async def broadcast_delphi(payload: dict):
    for ws in delphi_clients[:]:
        try:
            await ws.send_json(payload)
        except Exception:
            delphi_clients.remove(ws)


ingestion.on_event(on_match_event)


@app.on_event("startup")
async def startup():
    asyncio.create_task(ingestion.start())
    asyncio.create_task(fpl.start())
    if is_staged():
        # Pre-compute chaos in background — ready before anyone hits /chaos
        asyncio.create_task(_precompute_chaos())
    else:
        print("⚠  season_state.json not found — run stage_setup.py after MW37")


async def _precompute_chaos():
    global _chaos_cache
    print("→ Pre-computing season chaos index...")
    chaos_engine = SeasonChaosEngine()
    await chaos_engine.run()
    winner = chaos_engine.get_most_chaotic_goal()
    top10 = chaos_engine.get_top_n(10)
    _chaos_cache = {
        "computed_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "most_chaotic_goal": _chaos_goal_dict(winner) if winner else None,
        "top_10": [_chaos_goal_dict(g) for g in top10],
    }
    print(f"✓ Chaos index ready — most chaotic: {winner.scorer if winner else 'N/A'}")


def _chaos_goal_dict(g) -> dict:
    return {
        "scorer": g.scorer,
        "team": g.team,
        "opponent": g.opponent,
        "minute": g.minute,
        "score_at_time": g.score_at_time,
        "havoc_score": g.havoc_score,
        "breakdown": g.breakdown,
        "narrative": g.narrative,
    }


@app.get("/health")
async def health():
    live_count = sum(
        1 for s in ingestion.match_states.values()
        if s.status not in ("NS", "FT")
    )
    ft_count = sum(
        1 for s in ingestion.match_states.values()
        if s.status == "FT"
    )
    return {
        "staged": is_staged(),
        "staged_at": staged_at(),
        "fixtures_loaded": len(ingestion.match_states),
        "matches_live": live_count,
        "matches_finished": ft_count,
        "chaos_ready": _chaos_cache is not None,
        "active_spread_clients": len(spread_clients),
        "active_delphi_clients": len(delphi_clients),
        "pre_match_narrative": PRE_MATCH_NARRATIVE[:120] + "..." if len(PRE_MATCH_NARRATIVE) > 120 else PRE_MATCH_NARRATIVE,
    }


@app.get("/state")
async def get_state():
    return engine.get_full_state_snapshot()


@app.get("/delphi-payload")
async def get_delphi_payload():
    return build_delphi_payload(engine)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    try:
        await ws.send_json(engine.get_full_state_snapshot())
        while True:
            await ws.receive_text()  # Keep alive
    except Exception:
        connected_clients.remove(ws)


@app.websocket("/ws/delphi")
async def delphi_websocket(ws: WebSocket):
    await ws.accept()
    delphi_clients.append(ws)
    try:
        await ws.send_json(build_delphi_payload(engine))
        while True:
            await ws.receive_text()
    except Exception:
        delphi_clients.remove(ws)


@app.get("/preview")
async def get_preview():
    return build_full_preview(PRE_MATCH_STANDINGS, GOLDEN_BOOT_RACE)


@app.get("/recap")
async def get_recap():
    if not all_matches_finished(ingestion.match_states):
        return {"status": "matches_in_progress", "finished": False}
    recap = build_final_recap(engine, ingestion.match_states)
    recap["fantasy_league"] = build_fpl_recap(fpl.get_standings())
    return recap


@app.get("/chaos")
async def get_chaos():
    if _chaos_cache:
        return _chaos_cache
    # Not ready yet — compute synchronously (fallback)
    chaos_engine = SeasonChaosEngine()
    await chaos_engine.run()
    winner = chaos_engine.get_most_chaotic_goal()
    return {
        "most_chaotic_goal": _chaos_goal_dict(winner) if winner else None,
        "top_10": [_chaos_goal_dict(g) for g in chaos_engine.get_top_n(10)],
    }


@app.get("/spreads")
async def get_spreads():
    return spreads_to_json(compute_spreads(ingestion.match_states))


@app.websocket("/ws/spreads")
async def spreads_websocket(ws: WebSocket):
    await ws.accept()
    spread_clients.append(ws)
    try:
        await ws.send_json(spreads_to_json(compute_spreads(ingestion.match_states)))
        while True:
            await ws.receive_text()
    except Exception:
        spread_clients.remove(ws)


@app.get("/fpl/standings")
async def get_fpl_standings():
    return fpl.get_standings()


@app.websocket("/ws/fpl")
async def fpl_websocket(ws: WebSocket):
    await ws.accept()
    fpl_clients.append(ws)
    try:
        await ws.send_json({"type": "standings", "standings": fpl.get_standings()})
        while True:
            await ws.receive_text()
    except Exception:
        fpl_clients.remove(ws)


@app.get("/butterfly-effects")
async def get_butterfly_effects():
    return [
        {"trigger": b.trigger_event, "cascades": b.affected_scenarios}
        for b in engine.butterfly_log
    ]


@app.get("/flowcharts")
async def get_flowcharts():
    return generate_all_flowcharts(engine)
