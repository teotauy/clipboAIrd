# clipboAIrd — Anfield Oracle & MW38 Omniscient Simulator

**Owner:** Colby Black (colby@colbyangusblack.com) — Brooklyn OLSC member, Kop of Coffee writer, Liverpool supporter.

## What this is
A real-time predictive simulation dashboard for the final day of the Premier League season (Matchweek 38). All 10 fixtures kick off simultaneously. The app ingests live data, simulates every possible final outcome, and shows a probability heat-map of where every club can finish.

**Deployed at:** `clioboAIrd.colbyangusblack.com` (Vercel, frontend only)
**Backend:** FastAPI — needs Railway or Fly.io deploy (not yet done)

## Monorepo layout
```
backend/   FastAPI app (Python)
frontend/  Next.js app (TypeScript + Tailwind)
```

## Architecture
- **backend/main.py** — FastAPI entry point. 4 WebSocket channels: `/ws`, `/ws/delphi`, `/ws/spreads`, `/ws/fpl`
- **backend/live_ingestion.py** — Polls API-Football v3 every 20s. Skips FT matches.
- **backend/omniscient_engine.py** — Processes events, maintains live table, detects butterfly effects. Has a known dead reference to `_registry` in `_calculate_anfield_sentiment` — needs fixing.
- **backend/spread_calculator.py** — Enumerates all 3^N outcome permutations across live matches, builds probability distribution per team per position.
- **backend/narrative.py** — Generates Delphi (Colby's AI voice) commentary for goals, shots, cards, HT, FT, stoppage time.
- **backend/fpl_service.py** — Polls FPL unofficial API for Brooklyn OLSC fantasy league (ID: 113757). Maps goal scorers to FPL owners.
- **backend/stage_setup.py** — Run once after MW37 to write `season_state.json`. Usage: `API_FOOTBALL_KEY=xxx python stage_setup.py`
- **backend/config.py** — Loads `season_state.json` if present, stubs if not.
- **frontend/src/app/table/page.tsx** — HERO PAGE. Full-viewport spread matrix with probability heat-map, zone colours, butterfly effects, floating talking head, FPL tab.
- **frontend/src/components/FPLPanel.tsx** — Brooklyn OLSC fantasy league panel with 15 confirmed members hardcoded by `entry_id`.
- **frontend/src/components/TalkingHead.tsx** — JibJab-style animated talking head (Colby's face). ElevenLabs for goals/HT/FT, browser TTS for everything else.

## Environment variables

### Backend
```
API_FOOTBALL_KEY=       # API-Football v3 Pro plan key
DELPHI_WEBHOOK_URL=     # Delphi Digital Double webhook (optional)
ELEVENLABS_API_KEY=     # ElevenLabs (optional, for server-side TTS)
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_BASE=http://localhost:8000   # → Railway/Fly URL in prod
NEXT_PUBLIC_DELPHI_EMBED_URL=
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=
NEXT_PUBLIC_ELEVENLABS_API_KEY=
```

## Running locally
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Brooklyn OLSC confirmed members (FPL entry_id → real name)
| entry_id | Name | Rank (pre-GW38) |
|---|---|---|
| 7419755 | Colby Black (**highest-ranked member** 👑) | 3 |
| 516789 | Sam Clark | 5 |
| 205646 | Bill Palka | 6 |
| 202206 | Benjamin Hicks | 15 |
| 6933161 | Cillian Sheehan | 22 |
| 5852114 | Marisol Gallo | 23 |
| 779827 | George Lolashvili | 26 |
| 8089459 | Prateek Dwivedi | 25 |
| 4090828 | Catalina Caro | 27 |
| 673835 | Al Nieliwocki | 29 |
| 2715912 | Brett Portnoy | 33 |
| 5786521 | Terje Vist | 37 |
| 9014532 | Daniel Montoya | 38 |
| 7297423 | Aarif Attarwala | 41 |
| 3711462 | Adam McDaid | 42 |

## Pending tasks
- [ ] Deploy backend to Railway or Fly.io
- [ ] Set `NEXT_PUBLIC_API_BASE` in Vercel env vars to backend URL
- [ ] Add `CNAME` in Squarespace DNS: `clioboAIrd` → `cname.vercel-dns.com`
- [ ] Fix dead `_registry` reference in `omniscient_engine.py` `_calculate_anfield_sentiment`
- [ ] Simulation/replay mode for testing without a live match
- [ ] "What If" mode — manually set scores on spread table, watch distributions shift
- [ ] Mobile layout for spread table
- [ ] Nav bar across all pages
- [ ] FPL recap wired into frontend `/recap` page (backend done, frontend not updated)
- [ ] Fill actual MW38 fixture IDs — done automatically by `stage_setup.py` after MW37

## Key decisions / constraints
- API-Football Pro plan ($19/mo) — 7,500 req/day. Match day uses ~3,400 at 20s polling with FT-skip.
- ElevenLabs free tier (~10k chars/mo) — only goals/HT/FT use ElevenLabs (~8,300 chars). Everything else uses browser Web Speech API.
- Delphi Digital Double on free plan — used for embedded AI clone widget only, not for real-time event commentary.
- Spread calculator enumerates 3^N permutations where N = number of live (non-FT) matches. At N=10 that's 59,049 — fast enough to run on every goal.
- `season_state.json` must be written by `stage_setup.py` before match day. Without it the app runs in stub mode.
