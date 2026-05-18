# clipboAIrd — Active Subscriptions

| Service | Plan | Started | Cost | What it gets us | Cancel After |
|---|---|---|---|---|---|
| API-Football | Pro | 2026-05-17 | $19/mo | 7,500 req/day, 2025/26 season data — live fixtures, standings, scorers, events | ✅ 2026-05-25 |
| Fly.io | Pay-as-you-go | 2026-05-17 | ~$2/mo | Always-on FastAPI backend, 256MB shared VM, Newark region | After MW38 |
| Vercel | Free (Hobby) | 2026-05-17 | $0 | Next.js frontend hosting, auto-deploys from GitHub, SSL | Keep |
| ElevenLabs | Free | 2026-05-17 | $0 | 10k chars/mo TTS — goals/HT/FT on the talking head | — |

## Notes
- **API-Football Pro** — upgrade before MW38, cancel immediately after. Key: set as Fly secret `API_FOOTBALL_KEY`. Dashboard: api-sports.io
- **Fly.io** — billed per minute of machine runtime. Spin down after match day to stop the clock: `fly scale count 0`
- **Vercel** — frontend is static, free tier is fine unless traffic spikes
- **ElevenLabs** — free tier is 10k chars/mo. Match day uses ~8,300 chars. Should be fine. If you want a cloned voice of yourself, that requires Creator plan ($22/mo) — not currently set up.

## Reminder
Cancel API-Football Pro when you get back from your trip (week of ~2026-05-25).
