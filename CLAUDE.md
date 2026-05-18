# clipboAIrd — Anfield Oracle & MW38 Omniscient Simulator

**Owner:** Colby Black (colby@colbyangusblack.com)
Brooklyn OLSC member · Kop of Coffee writer · Liverpool supporter · highest-ranked confirmed member in the Brooklyn fantasy league.

**Repo:** https://github.com/teotauy/clipboAIrd
**Production URL:** https://clipboAIrd.colbyangusblack.com (Vercel, frontend)
**Backend:** FastAPI — Railway or Fly.io deploy not yet done

---

## What this is

A real-time predictive simulation dashboard for the final day of the Premier League season (Matchweek 38). All 10 fixtures kick off simultaneously. The app:

- Ingests live match data every 20 seconds across all 10 games
- Enumerates every mathematically possible final outcome (3^N permutations)
- Renders a probability heat-map showing where every club can still finish
- Fires commentary in Colby's voice (AI clone) on every significant event
- Tracks the Brooklyn OLSC fantasy league live during the match day
- Surfaces the most "chaotic" goal in the entire season — the one that caused the most simultaneous table upheaval

The **spread table is the centrepiece**. The talking head is the icing.

---

## Monorepo layout

```
/
├── backend/              FastAPI app (Python 3.12)
│   ├── main.py           Entry point, all routes and WebSocket channels
│   ├── config.py         Env vars + season_state.json loader
│   ├── live_ingestion.py API-Football polling loop
│   ├── omniscient_engine.py  Live table, butterfly effects, state snapshot
│   ├── spread_calculator.py  3^N permutation engine + probability distribution
│   ├── narrative.py      Colby-voice commentary for every event type
│   ├── delphi_webhook.py Delphi Digital Double payload builder + pusher
│   ├── flowchart_generator.py  Mermaid.js flowchart text generation
│   ├── fpl_service.py    Brooklyn OLSC fantasy league (league 113757)
│   ├── historical_chaos.py  Season chaos index — most havoc-causing goal
│   ├── prematch_preview.py  Pre-match day briefing builder
│   ├── postmatch_recap.py   Full-time season recap + FPL recap
│   ├── stage_setup.py    Run once after MW37 to write season_state.json
│   ├── requirements.txt
│   └── season_state.json   (gitignored, written by stage_setup.py)
│
└── frontend/             Next.js App Router (TypeScript + Tailwind CSS)
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx              Home / redirect
        │   ├── table/page.tsx        HERO PAGE — spread matrix
        │   ├── preview/page.tsx      Pre-match day briefing
        │   ├── recap/page.tsx        Post-match season recap
        │   ├── chaos/page.tsx        Season chaos index
        │   └── DelphiDigitalDouble/page.tsx  Embedded Delphi widget
        └── components/
            ├── TalkingHead.tsx       JibJab-style animated face widget
            ├── FPLPanel.tsx          Brooklyn OLSC fantasy league panel
            └── CommentaryFeed.tsx    Timestamped event commentary feed
```

---

## Running locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# Runs at http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

---

## Environment variables

### Backend (set in shell or Railway/Fly.io dashboard)

| Variable | Required | Description |
|---|---|---|
| `API_FOOTBALL_KEY` | Yes | API-Football v3 key (Pro plan, $19/mo) |
| `DELPHI_WEBHOOK_URL` | No | Delphi Digital Double inbound webhook URL |
| `DELPHI_API_KEY` | No | Delphi API key |

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_DELPHI_EMBED_URL=
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=
NEXT_PUBLIC_ELEVENLABS_API_KEY=
```

In production, `NEXT_PUBLIC_API_BASE` must point at the Railway/Fly.io backend URL.

---

## Backend deep-dive

### `stage_setup.py` — run this after MW37 final whistle

```bash
API_FOOTBALL_KEY=xxx python stage_setup.py
```

Makes ~4 API calls. Writes `season_state.json` with:
- All 10 MW38 fixture IDs
- Full PL standings after MW37
- Top 15 scorers (Golden Boot race)
- Top 10 assisters (Playmaker race)
- Bottom 3 teams (relegation zone)
- Pre-match narrative string for Delphi

Without this file the app runs in stub mode with placeholder fixture IDs (all `id: 0`).

---

### `config.py`

Loads `season_state.json` at startup. Exports:

- `MATCHWEEK_38_FIXTURE_IDS` — list of `{id, home, away}` dicts
- `PRE_MATCH_STANDINGS` — team → `{points, gd, gf}` after MW37
- `GOLDEN_BOOT_RACE`, `PLAYMAKER_RACE`
- `RELEGATION_ZONE_TEAMS`
- `PRE_MATCH_NARRATIVE` — opening context string for Delphi
- `PL_LEAGUE_ID = 39`, `PL_SEASON = 2025`
- `is_staged()`, `staged_at()`, `reload_state()`

---

### `live_ingestion.py`

Polls API-Football v3 every **20 seconds**. Skips finished (`FT`) matches entirely to save quota.

**`MatchEvent` fields:**
- `fixture_id`, `minute`, `type` (`"goal"` | `"card"` | `"shot"` | `"status_change"`)
- `team`, `player`, `assist`, `detail`, `stoppage_time`

**`LiveMatchState` fields:**
- `home`, `away`, `home_goals`, `away_goals`
- `minute`, `status` (`NS` | `1H` | `HT` | `2H` | `ET` | `FT`)
- `events: list[MatchEvent]`, `stats: dict`

**Filtering decisions:**
- Shots: on-target only
- Substitutions and VAR events: skipped
- Status transitions (HT/FT/Stoppage added time) fire as `status_change` events
- `_parse_stoppage` reads `fixture.status.extra` for added minutes

**API budget (Pro plan — 7,500 req/day):**
- Match day with 20s polling + FT-skip: ~3,400 requests. Safe.

---

### `omniscient_engine.py`

Processes events and maintains the live season picture.

**Methods:**
- `process_event(event, match_state)` — dispatches to goal/card/shot/status handlers
- `get_full_state_snapshot()` — master JSON: live_table, top_4_race, golden_boot, relegation, anfield_sentiment, butterfly_effects
- `get_live_table()` — sorted list of team standings
- `get_top_4_race()` — `{top_4, liverpool_position, liverpool_in_cl}`
- `get_golden_boot_standings()` — ranked scorer list
- `butterfly_log` — list of `ButterflyEffect` objects

**Butterfly effect logic:**
- Arsenal/City/Newcastle goal when Liverpool is outside top 4 → fires cascade
- Mapped to affected scenarios downstream

**Known bug:** `_calculate_anfield_sentiment` has a dead reference to `_registry`. Needs fixing before match day.

---

### `spread_calculator.py`

The core engine. Enumerates all `3^N` possible outcomes across `N` non-FT matches.

At N=10 (all games live): **59,049 permutations** — fast enough to run on every goal.

**`ClubSpread` fields:**
- `current_position`, `min_position`, `max_position`
- `locked` — True when min == max (mathematically certain finish)
- `cl_possible`, `cl_certain`, `relegated_possible`, `relegated_certain`
- `position_distribution: dict[int, float]` — position → probability (0.0–1.0), only non-zero entries
- `best_case_scenario`, `worst_case_scenario` — list of result strings

**`spreads_to_json()`** serialises with string keys (`{"1": 0.43, "2": 0.22, ...}`) for JSON. Also adds `spread_width` (max - min positions).

Tiebreaker order: points → goal difference → goals for.

---

### `narrative.py`

Builds Colby-voice commentary strings for every event type. Routed through `build_narrative(event, match_state, engine)`.

| Event | Tone |
|---|---|
| LFC goal | Euphoric — "GET IN", "YESSSSS" |
| Rival goal (LFC outside top 4) | Gut-punch — "Oh no", "Gut punch" |
| Other goal | Neutral but watchful |
| Shot on target | "Heart in mouth" / pulse-check |
| Yellow card | Dry / clipped |
| Red card | Full chaos mode |
| Half-time | Honest HT report with CL status |
| Full-time | Binary: euphoria or devastation |
| Stoppage +1 to +5 | Keyed takes per minute |
| Stoppage +6 and above | Existential takes (`"{n} minutes. That's not football, that's performance art."`) |

---

### `delphi_webhook.py`

Builds the payload for Delphi Digital Double and posts it to the inbound webhook.

Payload includes: live table, top 4 race, golden boot, anfield sentiment, butterfly effects, latest event narrative.

---

### `fpl_service.py`

Polls the FPL unofficial public API (no auth) for Brooklyn OLSC fantasy league (ID: **113757**), GW38.

**Startup sequence:**
1. `_bootstrap()` — loads all ~700 FPL players from `/bootstrap-static/`
2. `_fetch_league()` — gets league standings and all 50 manager entry IDs
3. `_fetch_all_picks()` — fetches every manager's GW38 squad in parallel
4. `_fetch_live_points()` — loads live GW points and recalculates standings
5. `_poll_loop()` — refreshes live points every 60 seconds

**Player name resolution (for goal event → FPL impact):**
1. Direct normalised match
2. Surname-only match
3. Full fuzzy scan — `SequenceMatcher` threshold 0.72

**Key methods:**
- `get_goal_impact(scorer_name)` → full impact dict with owner list and narrative
- `managers_who_own(fpl_player_id)` → managers with player in active XI + captain/multiplier
- `get_standings()` → ranked list with `rank`, `manager`, `team_name`, `entry_id`, `gw_points`, `total`, `captain`, `captain_points`, `active_players`

---

### `historical_chaos.py` — Season Chaos Engine

Fetches every completed fixture, replays goal-by-goal, scores each goal for "havoc".

**Havoc scoring:**
| Trigger | Points |
|---|---|
| Top 4 boundary crossed | 3.0 |
| Relegation boundary crossed | 3.0 |
| Europa League boundary crossed | 1.5 |
| Conference League boundary crossed | 1.0 |
| Golden Boot leader changes | 1.0 |
| Position cascade (per place shifted) | 0.15 |

Pre-computed on startup into `_chaos_cache`. Served from `/chaos` endpoint without re-fetching.

---

### `prematch_preview.py`

`build_full_preview(standings, golden_boot_race)` — structures the pre-match day briefing: standings, title race, top 4, relegation, boot race.

### `postmatch_recap.py`

`build_final_recap(engine, match_states)` — full season outcome when all 10 matches reach FT: final table, European spots, relegated teams, biggest result, Liverpool narrative, season summary.

`build_fpl_recap(fpl_standings)` — FPL winner, runner-up, last place, best/worst GW38, narrative.

`all_matches_finished(match_states)` — returns True when all statuses are `"FT"`.

---

### `main.py` — API routes

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Staged status, live/FT match counts, chaos ready, client counts |
| `/state` | GET | Full engine state snapshot |
| `/delphi-payload` | GET | Current Delphi payload |
| `/preview` | GET | Pre-match day briefing |
| `/recap` | GET | Full-time season recap (only after all FT) |
| `/chaos` | GET | Season chaos index (most havoc-causing goal) |
| `/spreads` | GET | Current spread distributions |
| `/fpl/standings` | GET | Brooklyn OLSC FPL standings |
| `/butterfly-effects` | GET | All butterfly effect events logged |
| `/flowcharts` | GET | Mermaid.js flowchart text |
| `/ws` | WebSocket | Full engine state, broadcast on every event |
| `/ws/delphi` | WebSocket | Delphi payloads, broadcast on goal/card/shot/status |
| `/ws/spreads` | WebSocket | Spread distributions, broadcast on every significant event |
| `/ws/fpl` | WebSocket | FPL standings + goal impact alerts |

**DELPHI_TRIGGER_TYPES** = `{"goal", "card", "shot", "status_change"}`

On goal: also triggers `get_goal_impact()` → `broadcast_fpl_impact()`.

---

## Frontend deep-dive

### `table/page.tsx` — HERO PAGE

Full-viewport spread matrix. This is the whole point.

**Layout:**
- Header bar: zone legend + nav links
- Main table: `flex-1`, 20 position slots per row
- Right panel: `w-64`, tabbed between "Spread" info and "🏆 Brooklyn" (FPLPanel)
- Bottom ticker: live event feed
- Floating talking head: fixed bottom-right corner

**Each position slot:**
- `backgroundColor`: zone hex colour
- `opacity`: `probToOpacity(prob, maxProb)` — gamma 0.45 curve, `MIN_OPACITY = 0.06`
- `transform: scaleY(1.25)` on current position slot
- `boxShadow` glow for locked / most-likely slots
- `LOCKED` label appears above mathematically certain positions

**Zone colours and boundaries:**

| Positions | Zone | Boundary lines at |
|---|---|---|
| 1 | Champion (gold) | After 1 |
| 2–4 | Champions League (blue) | After 4 |
| 5–6 | Europa League (orange) | After 6 |
| 7 | Conference League (green) | After 7 |
| 8–17 | Mid-table (gray) | After 17 |
| 18–20 | Relegation (red) | — |

`ZONE_TOP_BOUNDARIES = {2, 5, 7, 8, 18}` — draw horizontal dividers above these positions.

**Probability rendering:**
- `probToOpacity(prob, maxProb)`: `Math.pow(prob / maxProb, 0.45)` clamped to `[MIN_OPACITY, 1.0]`
- Current position: white-bordered circle with zone-coloured fill, `scaleY(1.25)`
- Flash animation (`animate-pulse` + outline) when distribution changes
- `posHistory` tracks live position changes and shows ▲/▼ deltas

---

### `TalkingHead.tsx`

JibJab-style animated talking head — Colby's face with a flapping mouth.

**Props:**
- `size`: `"sm"` (64px, floating corner widget) | `"md"` (256px, full page)
- `voiceTier`: `"premium"` (ElevenLabs) | `"browser"` (Web Speech API)

**Voice split (to fit ElevenLabs free tier ~10k chars/mo):**
- Goals, HT, FT → ElevenLabs (~8,300 chars total on match day)
- Shots, cards, stoppage → browser Web Speech API

**Mouth animation:** 120ms interval toggling open/closed. `mouthScale = size === "sm" ? 0.5 : 1`.

**Voice tier badge:** `"🎙 EL"` or `"🔊 BR"` shown during speech.

Falls through to browser TTS if ElevenLabs fails or is unconfigured.

---

### `FPLPanel.tsx`

Brooklyn OLSC fantasy league live panel. Connects to `/ws/fpl` WebSocket.

**Message types:**
- `{type: "standings", standings: FPLManager[]}` — full standings update
- `{type: "goal_impact", ...GoalImpact}` — flash card on every goal with owner list

**Goal impact flash card:** yellow border, player name + narrative + owner chips. Captain = yellow badge with ©. Clears after 30 seconds.

**Standings rows:**
- Rank, rank delta (▲▼ arrows), team name, manager name, GW points, total
- Expandable: captain name + points, top 5 players by points with ⚽/🅰 indicators
- `prevRanks` tracks rank changes between WebSocket updates

**Brooklyn OLSC member badges:**
- 🔴 red dot next to confirmed members' team names
- 👑 crown on Colby's row + red border treatment (entry_id `7419755`)

---

## Brooklyn OLSC confirmed members

Cross-referenced from orders.csv (column "Product Form: Name") against FPL league API using fuzzy matching with nickname expansion (Thomas↔Tommy, William↔Bill, etc.).

| entry_id | FPL Name | Real Name | Pre-GW38 Rank |
|---|---|---|---|
| 7419755 | Colby Black | Colby Black | 3 👑 highest member |
| 516789 | Sam Clark | Sam Clark | 5 |
| 205646 | Bill Palka | Bill Palka | 6 |
| 202206 | Benjamin Hicks | Benjamin Hicks | 15 |
| 6933161 | Cillian Sheehan | Cillian Sheehan | 22 |
| 5852114 | Marisol Gallo | Marisol Gallo Jalil | 23 |
| 779827 | George Lolashvili | Rati Lolashvili | 26 |
| 8089459 | Prateek Dwivedi | Prateek Dwivedi | 25 |
| 4090828 | Catalina Caro | Catalina Caro | 27 |
| 673835 | Al Nieliwocki | al nieliwocki | 29 |
| 2715912 | Brett Portnoy | Brett Portnoy | 33 |
| 5786521 | Terje Vist | TERJE VIST | 37 |
| 9014532 | Daniel Montoya | Daniel Montoya | 38 |
| 7297423 | Aarif Attarwala | Aarif Attarwala | 41 |
| 3711462 | Adam McDaid | Adam McDaid | 42 |

Hardcoded in `FPLPanel.tsx` as `BROOKLYN_MEMBERS`. `entry_id` is now included in `fpl_service.py` `get_standings()` output.

---

## Deployment plan

### Frontend → Vercel
1. Connect repo at https://github.com/teotauy/clipboAIrd to Vercel
2. Set **Root Directory** to `frontend`
3. Add env var: `NEXT_PUBLIC_API_BASE=<railway-url>`
4. Add custom domain: `clipboAIrd.colbyangusblack.com`

### DNS → Squarespace
In Squarespace DNS settings, add:
```
Type:  CNAME
Host:  clipboAIrd
Value: cname.vercel-dns.com
```

### Backend → Railway
1. Connect same repo, set **Root Directory** to `backend`
2. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Set env vars: `API_FOOTBALL_KEY`, optionally `DELPHI_WEBHOOK_URL`

---

## Pending tasks

- [ ] **Deploy backend to Railway** — get the URL, plug into Vercel env vars
- [ ] **Vercel deploy** — connect repo, set root dir to `frontend`, add custom domain
- [ ] **Squarespace DNS** — add CNAME for `clipboAIrd`
- [ ] **Fix `_registry` dead reference** in `omniscient_engine.py` `_calculate_anfield_sentiment`
- [ ] **Simulation / replay mode** — feed pre-recorded events for testing without a live match
- [ ] **"What If" mode** — UI to manually set scores on spread table and watch distributions shift in real time
- [ ] **Mobile layout** for the spread table (currently desktop-only)
- [ ] **Nav bar** across all pages (table, preview, recap, chaos, delphi)
- [ ] **FPL recap frontend** — `/recap` page backend is complete but frontend doesn't yet render the `fantasy_league` section
- [ ] **Run `stage_setup.py`** after MW37 final whistle to populate `season_state.json`

---

## Key constraints and decisions

| Decision | Reason |
|---|---|
| API-Football Pro plan ($19/mo, 7,500 req/day) | Free tier (100/day) not viable for live 10-game polling. Ultra ($39) not needed — Pro with 20s poll + FT-skip leaves 4,100 req to spare. |
| 20s poll interval (was 15s) | Reduced to stay well within Pro quota. 20s is imperceptible on match day. |
| FT matches skipped in poll loop | Saves ~50% of requests in the second half of match day as games finish. |
| ElevenLabs only for goals/HT/FT | Free tier ~10k chars/mo. Full event set would need ~26k. Split voice keeps it under limit. |
| Browser TTS for shots/cards/stoppage | Instant, no quota, sounds fine for non-headline events. |
| Delphi Digital Double | Free plan, used as embedded AI widget only — not real-time commentary engine. |
| 3^N spread enumeration | At N=10 = 59,049 permutations. Runs in <100ms. No sampling needed. |
| Chaos engine pre-computed on startup | `/chaos` was re-fetching the entire season on every request. Now computed once into `_chaos_cache`. |
| FPL name resolution: 3-tier fuzzy match | API-Football names don't match FPL names. Direct → surname → SequenceMatcher (threshold 0.72) covers 95%+ of cases. |
| `entry_id` in FPL standings payload | Required so frontend can match managers to hardcoded Brooklyn member list. |
| Monorepo (backend + frontend in one repo) | Simpler for a single-developer project. Railway and Vercel both support subdirectory root. |
