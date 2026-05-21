"""
Static historical facts and context for the MW38 preview dashboard.
All figures are hardcoded — they don't change during match day.
"""

# ─── SPREAD / PERMUTATION STATS ──────────────────────────────────────────────

PERMUTATION_STATS = {
    "total": 59049,          # 3^10 — home win / draw / away win across 10 games
    "simultaneous_kickoffs": 10,
    "kickoff_bst": "16:00",
    "tagline": "59,049 possible endings. Only one happens.",
}

# ─── RECORDS ON THE LINE ─────────────────────────────────────────────────────

HISTORY_ON_THE_LINE = [
    {
        "team": "Arsenal",
        "headline": "Their best points haul in 22 years",
        "body": (
            "Arsenal's 82 points before MW38 is already their highest total since the "
            "Invincibles (90pts, 2003–04). A win today takes them to 85 — second only to "
            "that untouchable season in club history."
        ),
        "icon": "🏆",
        "color": "#ef4444",
    },
    {
        "team": "Bournemouth",
        "headline": "Shattering their own ceiling",
        "body": (
            "Bournemouth's best ever Premier League finish is 9th, set in 2016–17. "
            "They're currently 6th. Any result today that keeps them in the top 9 "
            "breaks their record. A top-6 finish — CL possible — would be "
            "inconceivable by any previous measure of this club."
        ),
        "icon": "📈",
        "color": "#e11d48",
    },
    {
        "team": "Sunderland",
        "headline": "From League One to top half",
        "body": (
            "Three years ago Sunderland were playing in League One. Back in the "
            "Premier League for the first time since their 2017 relegation, "
            "they sit 10th with 51 points. A top-10 finish in their first season back "
            "would be one of the great promotion stories of the decade."
        ),
        "icon": "⚡",
        "color": "#ef4444",
    },
    {
        "team": "Brighton",
        "headline": "Matching their European era",
        "body": (
            "Brighton's best ever Premier League finish was 6th in 2022–23 under "
            "Roberto De Zerbi. Currently 7th, they're right back in that territory — "
            "and a Europa League spot is entirely within reach."
        ),
        "icon": "📊",
        "color": "#1d4ed8",
    },
    {
        "team": "Aston Villa",
        "headline": "Europa League champions — and still alive for more",
        "body": (
            "Aston Villa won the Europa League on Wednesday. But the drama isn't over: "
            "if they slip from 4th to 5th today, they cascade the extra CL spot down "
            "to 6th place. Either way, Villa are in the Champions League next season. "
            "First European title since their 1982 European Cup."
        ),
        "icon": "🏆",
        "color": "#7c3aed",
    },
]

# ─── EUROPEAN PEDIGREE ───────────────────────────────────────────────────────

EUROPEAN_PEDIGREE = [
    {
        "team": "Arsenal",
        "cl_seasons": 19,
        "cl_titles": 0,
        "el_titles": 0,
        "best_cl": "Final (2006)",
        "note": "Last appeared in CL in 2016–17",
    },
    {
        "team": "Manchester City",
        "cl_seasons": 14,
        "cl_titles": 1,
        "el_titles": 0,
        "best_cl": "Winners (2022–23)",
        "note": "Treble winners three seasons ago",
    },
    {
        "team": "Manchester United",
        "cl_seasons": 27,
        "cl_titles": 3,
        "el_titles": 1,
        "best_cl": "Winners (1968, 1999, 2008)",
        "note": "Most CL appearances of any English club",
    },
    {
        "team": "Aston Villa",
        "cl_seasons": 2,
        "cl_titles": 1,
        "el_titles": 1,
        "best_cl": "European Cup winners (1982)",
        "note": "EL winners 2025–26. First European title in 43 years.",
    },
    {
        "team": "Liverpool",
        "cl_seasons": 32,
        "cl_titles": 6,
        "el_titles": 3,
        "best_cl": "Winners (1977, 1978, 1981, 1984, 2005, 2019)",
        "note": "32 seasons in European Cup/CL — 17 pre-1992, 15 in the CL era including 2025–26",
    },
    {
        "team": "Bournemouth",
        "cl_seasons": 0,
        "cl_titles": 0,
        "el_titles": 0,
        "best_cl": "Never played European football",
        "note": "Would be their debut in European competition",
    },
]

# ─── MW38 FIXTURE CURIOSITIES ────────────────────────────────────────────────
# Populate with VERIFIED facts only — do NOT guess head-to-head records or
# recent form stats. Stakes-based notes derived from standings are safe.

FIXTURE_LORE: dict[str, dict] = {
    "Nottingham Forest vs Bournemouth": {
        "note": "Effectively a 5th-place shootout — both clubs are fighting for the same European spot.",
        "series": "",
    },
    "Burnley vs Wolves": {
        "note": "Both sides are already relegated. Pride and end-of-season bonuses on the line.",
        "series": "",
    },
}

# ─── GOLDEN BOOT — verified from premierleague.com before MW38 ───────────────

VERIFIED_GOLDEN_BOOT = [
    {"player": "Erling Haaland",        "team": "Manchester City",   "goals": 27},
    {"player": "Igor Thiago",           "team": "Brentford",         "goals": 22},
    {"player": "Antoine Semenyo",       "team": "Manchester City",   "goals": 16},
    {"player": "João Pedro",            "team": "Chelsea",           "goals": 15},
    {"player": "Viktor Gyökeres",       "team": "Arsenal",           "goals": 14},
    {"player": "Morgan Gibbs-White",    "team": "Nottingham Forest", "goals": 14},
    {"player": "Ollie Watkins",         "team": "Aston Villa",       "goals": 14},
    {"player": "Dominic Calvert-Lewin", "team": "Leeds United",      "goals": 14},
    {"player": "Junior Kroupi",         "team": "Bournemouth",       "goals": 13},
    {"player": "Danny Welbeck",         "team": "Brighton",          "goals": 13},
]

# ─── GOLDEN GLOVES RACE ──────────────────────────────────────────────────────
# Loaded from season_state.json (written by stage_setup.py via API-Football)

from config import GOLDEN_GLOVES_RACE

# ─── WILD FACTS ──────────────────────────────────────────────────────────────

WILD_FACTS = [
    {
        "stat": "59,049",
        "label": "mathematically possible endings",
        "detail": "That's 3 outcomes (W/D/L) across 10 simultaneous games.",
        "icon": "🔢",
    },
    {
        "stat": "All 10",
        "label": "kick off at 16:00 BST simultaneously",
        "detail": "The final day tradition since 1995 — no hiding, no watching scores elsewhere first.",
        "icon": "⏱",
    },
    {
        "stat": "6",
        "label": "Champions League spots on offer — maybe",
        "detail": "England earned an extra CL spot via performance coefficient. Whether it cascades to 6th depends on Villa's finish.",
        "icon": "🏆",
    },
    {
        "stat": "1",
        "label": "relegation battle still live",
        "detail": "Burnley and Wolves are already down. But West Ham (36pts) can still leapfrog Tottenham (38pts) if results go wrong.",
        "icon": "💀",
    },
    {
        "stat": "22 years",
        "label": "since Arsenal last won the title",
        "detail": "The Invincibles. 2003–04. They are close again — closer than they've been in two decades.",
        "icon": "📅",
    },
]


def build_facts() -> dict:
    return {
        "permutation_stats": PERMUTATION_STATS,
        "history_on_the_line": HISTORY_ON_THE_LINE,
        "european_pedigree": EUROPEAN_PEDIGREE,
        "fixture_lore": FIXTURE_LORE,
        "golden_gloves": GOLDEN_GLOVES_RACE,
        "wild_facts": WILD_FACTS,
    }
