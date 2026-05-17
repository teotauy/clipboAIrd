"""
FPL Service — Brooklyn OLSC Fantasy League (113757)
Polls the FPL unofficial API to track live GW38 standings
and map every goal scorer to the managers who own them.

No API key required. Polls live points every 60s.
"""

import asyncio
from dataclasses import dataclass, field
from difflib import SequenceMatcher

import httpx

FPL_BASE = "https://fantasy.premierleague.com/api"
LEAGUE_ID = 113757
GAMEWEEK = 38


@dataclass
class FPLPlayer:
    id: int
    name: str
    team: str
    position: str  # GKP, DEF, MID, FWD
    live_points: int = 0
    goals_scored: int = 0
    assists: int = 0
    bonus: int = 0
    yellow_card: bool = False
    red_card: bool = False
    clean_sheet: bool = False


@dataclass
class ManagerPick:
    player_id: int
    position: int       # 1–15 (1–11 playing, 12–15 bench)
    multiplier: int     # 1 normally, 2 if captain, 3 if TC
    is_captain: bool
    is_vice_captain: bool


@dataclass
class Manager:
    entry_id: int
    manager_name: str
    team_name: str
    overall_rank: int
    total_points_before_gw: int
    picks: list[ManagerPick] = field(default_factory=list)
    live_gw_points: int = 0
    live_total: int = 0
    live_rank: int = 0
    # Which playing players (not bench) are in their XI
    active_player_ids: list[int] = field(default_factory=list)
    captain_id: int = 0


class FPLService:
    def __init__(self):
        self.managers: list[Manager] = []
        self.players: dict[int, FPLPlayer] = {}       # id → FPLPlayer
        self.name_to_id: dict[str, int] = {}           # normalised name → id
        self._ready = False
        self._poll_task: asyncio.Task | None = None

    async def start(self):
        await self._bootstrap()
        await self._fetch_league()
        await self._fetch_all_picks()
        await self._fetch_live_points()
        self._ready = True
        print(f"✓ FPL service ready — {len(self.managers)} managers in Brooklyn league")
        self._poll_task = asyncio.create_task(self._poll_loop())

    def stop(self):
        if self._poll_task:
            self._poll_task.cancel()

    # ─── Bootstrap — player universe ────────────────────────────────────────

    async def _bootstrap(self):
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{FPL_BASE}/bootstrap-static/", timeout=20.0)
            data = resp.json()

        team_map = {t["id"]: t["short_name"] for t in data["teams"]}
        pos_map = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}

        for p in data["elements"]:
            player = FPLPlayer(
                id=p["id"],
                name=f"{p['first_name']} {p['second_name']}",
                team=team_map.get(p["team"], ""),
                position=pos_map.get(p["element_type"], ""),
            )
            self.players[p["id"]] = player
            self.name_to_id[_normalise(player.name)] = p["id"]
            # Also index by second name alone for fuzzy matching
            self.name_to_id[_normalise(p["second_name"])] = p["id"]

        print(f"  Loaded {len(self.players)} FPL players")

    # ─── League standings ────────────────────────────────────────────────────

    async def _fetch_league(self):
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{FPL_BASE}/leagues-classic/{LEAGUE_ID}/standings/",
                timeout=15.0,
            )
            data = resp.json()

        for entry in data["standings"]["results"]:
            self.managers.append(Manager(
                entry_id=entry["entry"],
                manager_name=entry["player_name"],
                team_name=entry["entry_name"],
                overall_rank=entry["rank"],
                total_points_before_gw=entry["total"] - entry.get("event_total", 0),
            ))

        print(f"  Found {len(self.managers)} managers in league")

    # ─── GW38 picks for every manager ───────────────────────────────────────

    async def _fetch_all_picks(self):
        async with httpx.AsyncClient() as client:
            tasks = [self._fetch_picks(client, m) for m in self.managers]
            await asyncio.gather(*tasks)

    async def _fetch_picks(self, client: httpx.AsyncClient, manager: Manager):
        try:
            resp = await client.get(
                f"{FPL_BASE}/entry/{manager.entry_id}/event/{GAMEWEEK}/picks/",
                timeout=15.0,
            )
            data = resp.json()
            picks = []
            active_ids = []
            for p in data.get("picks", []):
                pick = ManagerPick(
                    player_id=p["element"],
                    position=p["position"],
                    multiplier=p["multiplier"],
                    is_captain=p["is_captain"],
                    is_vice_captain=p["is_vice_captain"],
                )
                picks.append(pick)
                if p["position"] <= 11:
                    active_ids.append(p["element"])
                if p["is_captain"]:
                    manager.captain_id = p["element"]
            manager.picks = picks
            manager.active_player_ids = active_ids
        except Exception as e:
            print(f"  Could not fetch picks for {manager.manager_name}: {e}")

    # ─── Live GW points ──────────────────────────────────────────────────────

    async def _fetch_live_points(self):
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{FPL_BASE}/event/{GAMEWEEK}/live/",
                timeout=15.0,
            )
            data = resp.json()

        for element in data.get("elements", []):
            pid = element["id"]
            if pid not in self.players:
                continue
            stats = element["stats"]
            p = self.players[pid]
            p.live_points = stats.get("total_points", 0)
            p.goals_scored = stats.get("goals_scored", 0)
            p.assists = stats.get("assists", 0)
            p.bonus = stats.get("bonus", 0)
            p.yellow_card = stats.get("yellow_cards", 0) > 0
            p.red_card = stats.get("red_cards", 0) > 0
            p.clean_sheet = stats.get("clean_sheets", 0) > 0

        self._recalculate_standings()

    def _recalculate_standings(self):
        for manager in self.managers:
            gw_pts = 0
            for pick in manager.picks:
                if pick.position > 11:
                    continue  # bench — ignore for now (auto-subs not modelled)
                player = self.players.get(pick.player_id)
                if player:
                    gw_pts += player.live_points * pick.multiplier
            manager.live_gw_points = gw_pts
            manager.live_total = manager.total_points_before_gw + gw_pts

        # Sort and assign live ranks
        ranked = sorted(self.managers, key=lambda m: m.live_total, reverse=True)
        for i, m in enumerate(ranked):
            m.live_rank = i + 1

    async def _poll_loop(self):
        while True:
            await asyncio.sleep(60)
            try:
                await self._fetch_live_points()
            except Exception:
                pass

    # ─── Goal event hook ─────────────────────────────────────────────────────

    def resolve_scorer(self, player_name: str) -> FPLPlayer | None:
        """
        Match an API-Football player name to an FPL player.
        Returns the FPLPlayer if found, None otherwise.
        """
        norm = _normalise(player_name)

        # Direct hit
        if norm in self.name_to_id:
            return self.players.get(self.name_to_id[norm])

        # Fuzzy match on second name
        parts = norm.split()
        if parts:
            surname = parts[-1]
            if surname in self.name_to_id:
                return self.players.get(self.name_to_id[surname])

        # Full fuzzy scan — only if nothing else matched
        best_ratio = 0.0
        best_id = None
        for key, pid in self.name_to_id.items():
            ratio = SequenceMatcher(None, norm, key).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_id = pid

        if best_ratio > 0.72:
            return self.players.get(best_id)

        return None

    def managers_who_own(self, fpl_player_id: int) -> list[dict]:
        """
        Returns managers who have this player in their active XI,
        with captain/multiplier info.
        """
        result = []
        for m in self.managers:
            pick = next((p for p in m.picks if p.player_id == fpl_player_id and p.position <= 11), None)
            if pick:
                result.append({
                    "manager": m.manager_name,
                    "team": m.team_name,
                    "is_captain": pick.is_captain,
                    "multiplier": pick.multiplier,
                    "live_rank": m.live_rank,
                })
        return result

    # ─── Serialisation ───────────────────────────────────────────────────────

    def get_standings(self) -> list[dict]:
        ranked = sorted(self.managers, key=lambda m: m.live_total, reverse=True)
        return [
            {
                "rank": m.live_rank,
                "manager": m.manager_name,
                "team_name": m.team_name,
                "entry_id": m.entry_id,
                "gw_points": m.live_gw_points,
                "total": m.live_total,
                "captain": _player_name(self.players.get(m.captain_id)),
                "captain_points": _captain_points(self.players.get(m.captain_id)),
                "active_players": [
                    {
                        "name": _player_name(self.players.get(pid)),
                        "points": self.players[pid].live_points if pid in self.players else 0,
                        "goals": self.players[pid].goals_scored if pid in self.players else 0,
                        "assists": self.players[pid].assists if pid in self.players else 0,
                    }
                    for pid in m.active_player_ids
                ],
            }
            for m in ranked
        ]

    def get_goal_impact(self, scorer_name: str) -> dict | None:
        """
        Given a scorer's name, return which Brooklyn managers benefit
        and by how much (accounting for captain multipliers).
        """
        fpl_player = self.resolve_scorer(scorer_name)
        if not fpl_player:
            return None

        owners = self.managers_who_own(fpl_player.id)
        if not owners:
            return {
                "player": fpl_player.name,
                "fpl_team": fpl_player.team,
                "owned_by_count": 0,
                "owners": [],
                "narrative": f"{fpl_player.name} not owned by anyone in the Brooklyn league.",
            }

        captain_owners = [o for o in owners if o["is_captain"]]
        narrative = _goal_impact_narrative(fpl_player.name, owners, captain_owners)

        return {
            "player": fpl_player.name,
            "fpl_team": fpl_player.team,
            "owned_by_count": len(owners),
            "owners": owners,
            "narrative": narrative,
        }

    @property
    def ready(self) -> bool:
        return self._ready


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _normalise(name: str) -> str:
    return name.lower().strip().replace("-", " ").replace("'", "")


def _player_name(player: FPLPlayer | None) -> str:
    return player.name if player else "Unknown"


def _captain_points(player: FPLPlayer | None) -> int:
    return (player.live_points * 2) if player else 0


def _goal_impact_narrative(
    player_name: str,
    owners: list[dict],
    captain_owners: list[dict],
) -> str:
    count = len(owners)
    if captain_owners:
        cap_names = ", ".join(o["manager"].split()[0] for o in captain_owners)
        return (
            f"{player_name} goal. {count} Brooklyn manager{'s' if count > 1 else ''} own them — "
            f"{cap_names} captained them. That's a big swing."
        )
    names = ", ".join(o["manager"].split()[0] for o in owners[:3])
    suffix = f" and {count - 3} more" if count > 3 else ""
    return (
        f"{player_name} goal. Owned by {names}{suffix} in the Brooklyn league."
    )
