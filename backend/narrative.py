"""
Narrative & Sentiment Layer.
Converts raw event types into Colby-voice reactions for the Delphi payload.
Each function returns a string that becomes the narrative_summary field.
"""

import random
from live_ingestion import MatchEvent, LiveMatchState
from omniscient_engine import OmniscientEngine


# ─── GOAL REACTIONS ──────────────────────────────────────────────────────────

def goal_narrative(event: MatchEvent, match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()
    score = f"{match_state.home} {match_state.home_goals}–{match_state.away_goals} {match_state.away}"
    lfc_pos = top4["liverpool_position"]

    if event.team == "Liverpool":
        openers = [
            f"GET IN. {event.player} — {event.minute}' — Anfield erupts.",
            f"YESSSSS. {event.player} with the goal. Liverpool take the lead.",
            f"{event.player}! That's what we needed. Breathe.",
        ]
        closer = f"Liverpool now {score}. We're in position {lfc_pos}."
    elif not top4["liverpool_in_cl"] and event.team in [t["team"] for t in top4["top_4"]]:
        openers = [
            f"Oh no. {event.team} score through {event.player}. This is NOT what we needed.",
            f"Gut punch. {event.player} for {event.team}. The math is getting brutal.",
            f"Of course they score. {event.player}, {event.minute}'. Liverpool need to respond.",
        ]
        closer = f"Liverpool sit at position {lfc_pos}. The gap is real."
    else:
        openers = [
            f"{event.player} scores for {event.team} at {event.minute}'. {score}.",
            f"Goal elsewhere: {event.team} through {event.player}. Noted.",
            f"{event.team} score. {score}. Keeping an eye on this one.",
        ]
        closer = f"Liverpool at position {lfc_pos}."

    if event.assist:
        assist_str = f" Assisted by {event.assist}."
    else:
        assist_str = ""

    return f"{random.choice(openers)}{assist_str} {closer}"


# ─── SHOT ON TARGET REACTIONS ─────────────────────────────────────────────────

_SHOT_OPENERS = [
    "Heart in mouth.",
    "Keeper scrambling.",
    "That had 'oh god' written all over it.",
    "Pulse check: still alive.",
    "That nearly ended careers.",
]

def shot_narrative(event: MatchEvent, match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()

    if event.team == "Liverpool":
        return (
            f"Shot on target for Liverpool — {event.player}, {event.minute}'. "
            f"Pressure building. We need this."
        )

    if not top4["liverpool_in_cl"] and event.team in [t["team"] for t in top4["top_4"]]:
        return (
            f"{random.choice(_SHOT_OPENERS)} {event.player} ({event.team}) testing the keeper at {event.minute}'. "
            f"If that goes in, Liverpool's position gets messier."
        )

    return (
        f"Shot on target: {event.player} ({event.team}) at {event.minute}'. "
        f"Keeper dealt with it."
    )


# ─── CARD REACTIONS ───────────────────────────────────────────────────────────

_YELLOW_LAMENTS = [
    "Booking. Not ideal, not catastrophic.",
    "Yellow shown. Referee earning his keep.",
    "Card out. One more and he walks.",
]

_RED_CHAOS = [
    "RED CARD. Everything changes now.",
    "He's GONE. Ten men. Chaos incoming.",
    "Off. He's off. This match just turned inside out.",
]

def card_narrative(event: MatchEvent, match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    is_red = "red" in (event.detail or "").lower()
    is_lfc = event.team == "Liverpool"
    top4 = engine.get_top_4_race()

    if is_red:
        opener = random.choice(_RED_CHAOS)
        if is_lfc:
            return (
                f"{opener} {event.player} dismissed for Liverpool at {event.minute}'. "
                f"We're playing 10 vs 11. "
                f"CL position {top4['liverpool_position']} is now hanging by a thread."
            )
        return (
            f"{opener} {event.player} off for {event.team} at {event.minute}'. "
            f"This reshapes the whole game — and by extension, our afternoon."
        )

    opener = random.choice(_YELLOW_LAMENTS)
    if is_lfc:
        return f"{opener} {event.player} booked at {event.minute}'. Keep your head, son."
    return f"{opener} {event.player} ({event.team}) at {event.minute}'."


# ─── HALF-TIME REACTIONS ─────────────────────────────────────────────────────

def halftime_narrative(match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()
    lfc_pos = top4["liverpool_position"]
    in_cl = top4["liverpool_in_cl"]
    score = f"{match_state.home} {match_state.home_goals}–{match_state.away_goals} {match_state.away}"

    cl_status = (
        "Liverpool IN the Champions League places at the break."
        if in_cl
        else f"Liverpool OUTSIDE the top 4 at half-time. Position {lfc_pos}. Fix this."
    )

    summaries = [
        f"Half-time: {score}. {cl_status} 45 minutes to sort our lives out.",
        f"Whistle. {score} at the break. {cl_status} Go get a drink. You'll need it.",
        f"HT: {score}. {cl_status} Whatever happens in that dressing room — it better work.",
    ]
    return random.choice(summaries)


# ─── FULL-TIME REACTIONS ──────────────────────────────────────────────────────

def fulltime_narrative(match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()
    lfc_pos = top4["liverpool_position"]
    in_cl = top4["liverpool_in_cl"]
    score = f"{match_state.home} {match_state.home_goals}–{match_state.away_goals} {match_state.away}"

    if in_cl:
        reactions = [
            f"FULL TIME: {score}. Liverpool IN. Position {lfc_pos}. YNWA.",
            f"It's over. Final score: {score}. We're IN the Champions League. I need to lie down.",
            f"FT: {score}. Top {lfc_pos}. Champions League football confirmed. Brooklyn OLSC, rise.",
        ]
    else:
        reactions = [
            f"Full time: {score}. We're OUT. Position {lfc_pos}. I don't want to talk about it.",
            f"FT: {score}. Liverpool outside the top 4. This is going to be a long summer.",
            f"Final whistle. {score}. Position {lfc_pos}. Right. Season's review is going to be grim.",
        ]
    return random.choice(reactions)


# ─── STOPPAGE TIME TAKES ──────────────────────────────────────────────────────

_STOPPAGE_TAKES = {
    1: [
        "One minute. Blink and you'll miss it. Somehow still feels like forever.",
        "A single minute of stoppage. Is the fourth official asleep?",
        "+1. Ceremonial. Might as well be a coin flip.",
    ],
    2: [
        "Two minutes. Enough time to concede twice and age a decade.",
        "+2. The bare minimum of suffering.",
        "Two extra minutes. Referee's being merciful. Or cruel. Hard to say.",
    ],
    3: [
        "Three minutes. Standard British cruelty.",
        "+3. Long enough for the universe to punish you. Not long enough to fix it.",
        "Three added minutes. The classic. A perfect amount of agony.",
    ],
    4: [
        "+4 minutes. Someone's having a laugh.",
        "Four minutes. Right, so we're doing this.",
        "Four extra. The kind of number that makes managers pace.",
    ],
    5: [
        "FIVE minutes stoppage. We're all going to age significantly.",
        "+5. At this point just play a sixth half.",
        "Five minutes. Half-ten becomes genuine football. Buckle up.",
    ],
}

_HIGH_STOPPAGE = [
    "{n} minutes of stoppage. At this point it's just another half.",
    "+{n}. The board goes up and half the stadium audibly exhales.",
    "{n} added minutes. That's not football, that's performance art.",
    "+{n}. Someone needs to explain to me why we do this to ourselves.",
]

def stoppage_narrative(stoppage_time: int, match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()
    lfc_in_cl = top4["liverpool_in_cl"]
    lfc_match = match_state.home == "Liverpool" or match_state.away == "Liverpool"

    if stoppage_time in _STOPPAGE_TAKES:
        base = random.choice(_STOPPAGE_TAKES[stoppage_time])
    else:
        base = random.choice(_HIGH_STOPPAGE).format(n=stoppage_time)

    if lfc_match and not lfc_in_cl:
        base += f" Liverpool need a result. Every second of these {stoppage_time} minutes counts."
    elif lfc_match and lfc_in_cl:
        base += f" Just hold on. {stoppage_time} minutes. Hold on."

    return base


# ─── DISPATCHER ──────────────────────────────────────────────────────────────

def build_narrative(event: MatchEvent, match_state: LiveMatchState, engine: OmniscientEngine) -> str:
    if event.type == "goal":
        return goal_narrative(event, match_state, engine)
    elif event.type == "shot":
        return shot_narrative(event, match_state, engine)
    elif event.type == "card":
        return card_narrative(event, match_state, engine)
    elif event.type == "status_change":
        if event.detail == "HT":
            return halftime_narrative(match_state, engine)
        elif event.detail == "FT":
            return fulltime_narrative(match_state, engine)
        elif event.detail == "Stoppage" and event.stoppage_time:
            return stoppage_narrative(event.stoppage_time, match_state, engine)
    return ""
