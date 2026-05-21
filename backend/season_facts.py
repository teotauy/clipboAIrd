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
            "Aston Villa won the Europa League on Thursday. But the drama isn't over: "
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
        "cl_seasons": 14,
        "cl_titles": 6,
        "el_titles": 3,
        "best_cl": "Winners (1977, 1978, 1981, 1984, 2005, 2019)",
        "note": "Record 6 European Cups/CL titles for an English club",
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
# Fun historical notes about each fixture

FIXTURE_LORE = {
    "Liverpool vs Brentford": {
        "note": "Brentford have never won at Anfield in the Premier League era.",
        "series": "Liverpool have won their last 4 home league games against Brentford.",
    },
    "Crystal Palace vs Arsenal": {
        "note": "Arsenal have not lost a league game on the final day of the season since 2003.",
        "series": "This fixture carries relegation weight too — Palace are 15th, needing points to stay clear.",
    },
    "Manchester City vs Aston Villa": {
        "note": "The reverse fixture this season ended 1–1. Villa beat City 1–0 at Villa Park last season.",
        "series": "City have won 8 of their last 10 home league games against Villa.",
    },
    "Brighton vs Manchester United": {
        "note": "Brighton beat Man United 3–1 at the Amex last season. United's away form has been wretched.",
        "series": "Brighton are unbeaten in their last 3 home matches against United.",
    },
    "Sunderland vs Chelsea": {
        "note": "Sunderland's last win over Chelsea in the top flight was in 2014.",
        "series": "Chelsea have won 6 of the last 8 meetings between these sides.",
    },
    "Nottingham Forest vs Bournemouth": {
        "note": "This is effectively a 5th-place shootout. Both clubs need a result.",
        "series": "Forest have lost only 2 home league games all season.",
    },
    "Fulham vs Newcastle": {
        "note": "Fulham and Newcastle have been closely matched all season — both sitting mid-table.",
        "series": "The reverse fixture ended 1–1 at St. James' Park.",
    },
    "Tottenham vs Everton": {
        "note": "Tottenham haven't won a league game at home since February.",
        "series": "Everton are winless in their last 6 away matches.",
    },
    "West Ham vs Leeds": {
        "note": "Leeds are fighting to avoid the drop. West Ham have nothing left to play for.",
        "series": "Leeds' survival fight makes this a must-win — but they've won only 2 away games all season.",
    },
    "Burnley vs Wolves": {
        "note": "Two relegated clubs with nothing left to settle except pride and bonuses.",
        "series": "Both sides are already down — this is the last rites.",
    },
}

# ─── GOLDEN GLOVES RACE ──────────────────────────────────────────────────────
# Top clean sheet keepers — manual data since we don't poll this from the API

GOLDEN_GLOVES_RACE = [
    {"keeper": "David Raya",        "team": "Arsenal",           "clean_sheets": 17},
    {"keeper": "Alisson Becker",    "team": "Liverpool",         "clean_sheets": 14},
    {"keeper": "Ederson",           "team": "Manchester City",   "clean_sheets": 13},
    {"keeper": "Neto",              "team": "Bournemouth",       "clean_sheets": 11},
    {"keeper": "Robert Sánchez",    "team": "Chelsea",           "clean_sheets": 10},
]

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
        "stat": "3",
        "label": "relegation battles still live",
        "detail": "Burnley and Wolves are down. But Tottenham (38pts) and West Ham (36pts) are not safe yet.",
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
