"""
Live data ingestion layer — polls API-Football for all 10 MW38 fixtures
simultaneously and emits normalized match events to the Omniscient Engine.
"""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Callable

import httpx

from config import API_FOOTBALL_KEY, API_FOOTBALL_BASE, MATCHWEEK_38_FIXTURE_IDS

# Poll only within this window around kick-off (hours before / after)
_POLL_WINDOW_HOURS_BEFORE = 1
_POLL_WINDOW_HOURS_AFTER = 4


def _match_day_active() -> bool:
    """Return True only when we're within the polling window of any fixture."""
    now = datetime.now(timezone.utc)
    for fixture in MATCHWEEK_38_FIXTURE_IDS:
        kick_off_str = fixture.get("date")
        if not kick_off_str:
            continue
        try:
            kick_off = datetime.fromisoformat(kick_off_str)
        except ValueError:
            continue
        window_start = kick_off - timedelta(hours=_POLL_WINDOW_HOURS_BEFORE)
        window_end = kick_off + timedelta(hours=_POLL_WINDOW_HOURS_AFTER)
        if window_start <= now <= window_end:
            return True
    return False


@dataclass
class MatchEvent:
    fixture_id: int
    minute: int
    type: str  # "goal", "card", "shot", "status_change"
    team: str
    player: str
    assist: str | None = None
    detail: str | None = None  # "Normal Goal", "Penalty", "Own Goal", "Yellow", "Red", "Shot on Target", "HT", "FT", "Stoppage"
    stoppage_time: int | None = None  # minutes of added time


@dataclass
class LiveMatchState:
    fixture_id: int
    home: str
    away: str
    home_goals: int = 0
    away_goals: int = 0
    minute: int = 0
    status: str = "NS"  # NS, 1H, HT, 2H, FT
    events: list[MatchEvent] = field(default_factory=list)
    stats: dict = field(default_factory=dict)  # xG, possession, shots


class LiveIngestionService:
    def __init__(self, poll_interval: float = 20.0):
        self.poll_interval = poll_interval
        self.match_states: dict[int, LiveMatchState] = {}
        self.event_callbacks: list[Callable] = []
        self._running = False

        for fixture in MATCHWEEK_38_FIXTURE_IDS:
            self.match_states[fixture["id"]] = LiveMatchState(
                fixture_id=fixture["id"],
                home=fixture["home"],
                away=fixture["away"],
            )

    def on_event(self, callback: Callable):
        self.event_callbacks.append(callback)

    async def start(self):
        self._running = True
        async with httpx.AsyncClient() as client:
            while self._running:
                if not _match_day_active():
                    # Outside match-day window — check again in 5 minutes, don't burn quota
                    await asyncio.sleep(300)
                    continue
                await self._poll_all_fixtures(client)
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        self._running = False

    async def _poll_all_fixtures(self, client: httpx.AsyncClient):
        # Skip fixtures that are already finished — saves requests on Pro plan
        tasks = [
            self._poll_fixture(client, f["id"])
            for f in MATCHWEEK_38_FIXTURE_IDS
            if f["id"] != 0
            and self.match_states.get(f["id"], LiveMatchState(f["id"], f["home"], f["away"])).status != "FT"
        ]
        if tasks:
            await asyncio.gather(*tasks)

    async def _poll_fixture(self, client: httpx.AsyncClient, fixture_id: int):
        try:
            resp = await client.get(
                f"{API_FOOTBALL_BASE}/fixtures",
                params={"id": fixture_id},
                headers={"x-apisports-key": API_FOOTBALL_KEY},
                timeout=10.0,
            )
            data = resp.json()
            if data.get("results", 0) > 0:
                self._process_fixture_response(fixture_id, data["response"][0])
        except Exception:
            pass  # Silently retry next poll cycle

    def _process_fixture_response(self, fixture_id: int, raw: dict):
        state = self.match_states[fixture_id]
        prev_event_count = len(state.events)
        prev_status = state.status

        state.home_goals = raw["goals"]["home"] or 0
        state.away_goals = raw["goals"]["away"] or 0
        state.minute = raw["fixture"]["status"]["elapsed"] or 0
        state.status = raw["fixture"]["status"]["short"]
        state.stats = self._extract_stats(raw.get("statistics", []))

        # Match events: goals, cards, shots
        for ev in raw.get("events", []):
            ev_type = ev["type"].lower()
            ev_detail = ev.get("detail", "")

            # Normalize shots — only fire on Shot on Target
            if ev_type == "var" or (ev_type == "subst"):
                continue
            if ev_type == "shot" and "on target" not in ev_detail.lower():
                continue

            match_event = MatchEvent(
                fixture_id=fixture_id,
                minute=ev["time"]["elapsed"],
                type="shot" if ev_type == "shot" else ev_type,
                team=ev["team"]["name"],
                player=ev["player"]["name"],
                assist=ev.get("assist", {}).get("name"),
                detail=ev_detail,
            )
            if match_event not in state.events:
                state.events.append(match_event)

        # Status transitions: HT and FT triggers
        if prev_status != state.status:
            if state.status in ("HT", "FT"):
                stoppage = self._parse_stoppage(raw)
                status_event = MatchEvent(
                    fixture_id=fixture_id,
                    minute=state.minute,
                    type="status_change",
                    team="",
                    player="",
                    detail=state.status,
                    stoppage_time=stoppage,
                )
                state.events.append(status_event)

            # Stoppage time announced (2H or ET extras)
            if state.status in ("2H", "ET") and prev_status in ("HT", "1H", "2H"):
                stoppage = self._parse_stoppage(raw)
                if stoppage:
                    stop_event = MatchEvent(
                        fixture_id=fixture_id,
                        minute=state.minute,
                        type="status_change",
                        team="",
                        player="",
                        detail="Stoppage",
                        stoppage_time=stoppage,
                    )
                    state.events.append(stop_event)

        new_events = state.events[prev_event_count:]
        for event in new_events:
            for cb in self.event_callbacks:
                cb(event, state)

    def _extract_stats(self, statistics: list) -> dict:
        stats = {}
        for s in statistics:
            team = s.get("team", {}).get("name", "")
            for stat in s.get("statistics", []):
                key = stat["type"]
                stats.setdefault(key, {})[team] = stat["value"]
        return stats

    def _parse_stoppage(self, raw: dict) -> int | None:
        try:
            extra = raw["fixture"]["status"].get("extra")
            return int(extra) if extra else None
        except (TypeError, ValueError):
            return None
