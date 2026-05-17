"""
Dynamic Mermaid.js flowchart generator.
Converts live Omniscient Engine state into narrative decision trees
that update every time a goal goes in across the league.
"""

from omniscient_engine import OmniscientEngine


def generate_top4_flowchart(engine: OmniscientEngine) -> str:
    top4 = engine.get_top_4_race()
    table = engine.get_live_table()
    lfc = engine.standings.get("Liverpool")

    if not lfc:
        return "graph TD\n    A[No Liverpool data]"

    lfc_pts = lfc.total_points
    lfc_gd = lfc.total_gd
    lfc_pos = top4["liverpool_position"]

    lines = ["graph TD"]
    lines.append(f'    START["⚽ MATCHWEEK 38 LIVE"]')
    lines.append(f'    LFC_NOW["Liverpool: {lfc_pts}pts | GD {lfc_gd:+d} | Pos {lfc_pos}"]')
    lines.append("    START --> LFC_NOW")

    if top4["liverpool_in_cl"]:
        lines.append('    LFC_NOW -->|"CURRENTLY IN"| CL_YES["✅ Champions League QUALIFIED"]')
        lines.append('    style CL_YES fill:#00b894,color:#fff')

        fourth = table[3] if len(table) > 3 else None
        fifth = table[4] if len(table) > 4 else None
        if fourth and fifth:
            gap = fourth.total_points - fifth.total_points
            lines.append(f'    CL_YES --- BUFFER["{gap}pt cushion over {fifth.team}"]')
    else:
        lines.append('    LFC_NOW -->|"CURRENTLY OUT"| CL_NO["❌ Outside Top 4"]')
        lines.append('    style CL_NO fill:#d63031,color:#fff')

        fourth = table[3] if len(table) > 3 else None
        if fourth:
            lines.append(f'    CL_NO --- NEED["Need: overtake {fourth.team} ({fourth.total_points}pts, GD {fourth.total_gd:+d})"]')

    # Butterfly branches
    for i, effect in enumerate(engine.butterfly_log[-3:]):
        node_id = f"BF_{i}"
        lines.append(f'    {node_id}["{effect.trigger_event}"]')
        for j, cascade in enumerate(effect.affected_scenarios):
            child_id = f"{node_id}_{j}"
            lines.append(f'    {child_id}["{cascade["narrative"][:60]}"]')
            lines.append(f"    {node_id} --> {child_id}")
        lines.append(f"    LFC_NOW -.->|butterfly| {node_id}")

    return "\n".join(lines)


def generate_golden_boot_flowchart(engine: OmniscientEngine) -> str:
    standings = engine.get_golden_boot_standings()
    if not standings:
        return "graph TD\n    A[No Golden Boot data]"

    lines = ["graph LR"]
    lines.append('    TITLE["👟 GOLDEN BOOT RACE"]')

    for i, entry in enumerate(standings[:5]):
        node = f"P{i}"
        medal = "🥇" if i == 0 else "🥈" if i == 1 else "🥉" if i == 2 else "  "
        lines.append(f'    {node}["{medal} {entry["player"]} ({entry["team"]}) — {entry["goals"]} goals"]')
        if i == 0:
            lines.append(f"    TITLE --> {node}")
        else:
            lines.append(f"    P{i-1} --> {node}")

    return "\n".join(lines)


def generate_relegation_flowchart(engine: OmniscientEngine) -> str:
    table = engine.get_live_table()
    if len(table) < 20:
        return "graph TD\n    A[Insufficient data]"

    lines = ["graph TD"]
    lines.append('    TITLE["💀 RELEGATION BATTLE"]')
    lines.append('    LINE["───── SURVIVAL LINE ─────"]')
    lines.append("    TITLE --> LINE")

    safe = table[-4]  # 17th — just safe
    lines.append(f'    SAFE["{safe.team}: {safe.total_points}pts (SAFE)"]')
    lines.append('    style SAFE fill:#00b894,color:#fff')
    lines.append("    LINE --> SAFE")

    for i, team in enumerate(table[-3:]):
        node = f"REL_{i}"
        lines.append(f'    {node}["{team.team}: {team.total_points}pts | GD {team.total_gd:+d}"]')
        lines.append(f'    style {node} fill:#d63031,color:#fff')
        lines.append(f"    LINE --> {node}")

    return "\n".join(lines)


def generate_all_flowcharts(engine: OmniscientEngine) -> dict:
    return {
        "top_4": generate_top4_flowchart(engine),
        "golden_boot": generate_golden_boot_flowchart(engine),
        "relegation": generate_relegation_flowchart(engine),
    }
