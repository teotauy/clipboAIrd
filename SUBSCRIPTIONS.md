# clipboAIrd — Active Subscriptions

| Service | Plan | Cost | Purpose | Cancel After |
|---|---|---|---|---|
| API-Football | Pro | $19/mo | Live match data, standings, scorers | ✅ After MW38 (mid-May 2026) |
| Fly.io | Pay-as-you-go | ~$2/mo | Backend hosting (FastAPI) | After season |
| Vercel | Free/Pro | $0–20/mo | Frontend hosting (Next.js) | Keep if reusing |
| ElevenLabs | Free | $0 | TTS for goals/HT/FT (~10k chars/mo) | — |

## Notes
- **API-Football Pro** — upgrade before MW38, cancel immediately after. Key: set as Fly secret `API_FOOTBALL_KEY`. Dashboard: api-sports.io
- **Fly.io** — billed per minute of machine runtime. Spin down after match day to stop the clock: `fly scale count 0`
- **Vercel** — frontend is static, free tier is fine unless traffic spikes
- **ElevenLabs** — free tier is 10k chars/mo. Match day uses ~8,300 chars. Should be fine. If you want a cloned voice of yourself, that requires Creator plan ($22/mo) — not currently set up.

## Reminder
Cancel API-Football Pro when you get back from your trip (week of ~2026-05-25).
