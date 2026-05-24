"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import FPLPanel from "@/components/FPLPanel";
import Soundboard from "@/components/Soundboard";

const StadiumMap = dynamic(() => import("@/components/StadiumMap"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const TOTAL_POSITIONS = 20;
const POLL_INTERVAL_S = 20;

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SpreadEntry {
  team: string;
  current_position: number;
  current_points: number;
  current_gd: number;
  min_position: number;
  max_position: number;
  locked: boolean;
  cl_possible: boolean;
  cl_certain: boolean;
  relegated_possible: boolean;
  relegated_certain: boolean;
  el_winner?: boolean;
  best_case: string[];
  worst_case: string[];
  spread_width: number;
  position_distribution: Record<string, number>;
  position_scenarios: Record<string, string[][]>;
}

interface LiveScore {
  home: string; away: string; home_goals: number; away_goals: number; minute: number; status: string;
}

interface FixturePreview {
  home: string; away: string;
  home_position: number | string; away_position: number | string;
  home_points: number | string; away_points: number | string;
  stakes: string[]; golden_boot_watch: string[]; narrative: string;
}

interface PreviewData {
  day_summary: string;
  standings_incomplete?: boolean;
  fixtures: FixturePreview[];
  key_battles: {
    europe: { team: string; position: number; points: number; min_position: number; max_position: number; locked: boolean }[];
    golden_boot: { player: string; team: string; goals: number }[];
    relegation: { team: string; points: number; position: number }[];
  };
  facts?: {
    permutation_stats: { total: number; simultaneous_kickoffs: number; kickoff_bst: string; tagline: string };
    history_on_the_line: { team: string; headline: string; body: string; icon: string; color: string }[];
    european_pedigree: { team: string; cl_seasons: number; cl_titles: number; el_titles: number; best_cl: string; note: string }[];
    fixture_lore: Record<string, { note: string; series: string }>;
    golden_gloves: { keeper: string; team: string; clean_sheets: number }[];
    wild_facts: { stat: string; label: string; detail: string; icon: string }[];
  };
}

interface RecapData {
  finished: boolean; champions: string;
  final_table: { position: number; team: string; points: number; gd: number; gf: number; label: string; relegated: boolean }[];
  mw38_results: { home: string; away: string; home_goals: number; away_goals: number; result: string }[];
  relegated: string[];
  golden_boot_winner: { player: string; team: string; goals: number } | null;
  biggest_result: { home: string; away: string; home_goals: number; away_goals: number } | null;
  liverpool_narrative: string; season_narrative: string;
}

interface ChaosGoal {
  scorer: string; team: string; opponent: string; minute: number; matchweek: number;
  score_at_time: string; havoc_score: number; narrative: string;
  breakdown?: Record<string, number>; ramifications?: string[];
}
interface ChaosData { most_chaotic_goal: ChaosGoal | null; top_10: ChaosGoal[]; }

// ─── ZONES ────────────────────────────────────────────────────────────────────

const ZONES = [
  { from: 1,  to: 1,  label: "Champions",       short: "PL",   hex: "#d4a500" },
  { from: 2,  to: 5,  label: "Champ. Lg.",       short: "CL",   hex: "#2563eb" },
  { from: 6,  to: 6,  label: "CL (if Villa 5th)", short: "CL?",  hex: "#7c3aed" },
  { from: 7,  to: 8,  label: "Europa Lg.",       short: "EL",   hex: "#ea6c1a" },
  { from: 9,  to: 9,  label: "Conference",       short: "UECL", hex: "#16a34a" },
  { from: 10, to: 17, label: "",                 short: "",     hex: "#1e2a3a" },
  { from: 18, to: 20, label: "Relegation",       short: "REL",  hex: "#dc2626" },
];
function zoneFor(pos: number) { return ZONES.find((z) => pos >= z.from && pos <= z.to) ?? ZONES[5]; }
const ZONE_BOUNDARY_AFTER = [1, 5, 6, 8, 9, 17];
const MIN_OPACITY = 0.05;
function probToOpacity(prob: number, maxProb: number) {
  if (prob === 0) return 0;
  return MIN_OPACITY + (1 - MIN_OPACITY) * Math.pow(prob / maxProb, 0.4);
}

// ─── SCROLL REVEAL ────────────────────────────────────────────────────────────

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(18px)",
        transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── STAT BAR (Golden Boot / Gloves) ─────────────────────────────────────────

function StatBar({
  rank, name, sub, value, maxValue, color, inView, delay,
}: {
  rank: number; name: string; sub: string; value: number; maxValue: number;
  color: string; inView: boolean; delay: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "#0f1929" }}>
      <span className="font-mono text-xs w-5 text-center flex-shrink-0" style={{ color: rank === 1 ? color : "#2a4060" }}>{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-semibold text-white truncate">{name}</span>
          <span className="font-black text-sm flex-shrink-0 ml-2" style={{ color }}>{value}</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "#0a0f1e" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: inView ? `${(value / maxValue) * 100}%` : "0%",
              background: rank === 1
                ? `linear-gradient(to right, ${color}cc, ${color})`
                : `${color}66`,
              transition: `width 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
              filter: rank === 1 ? `drop-shadow(0 0 4px ${color}88)` : undefined,
            }}
          />
        </div>
        <div className="text-[10px] mt-0.5 truncate" style={{ color: "#2a4060" }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── STAT BAR LIST (needs its own component to call useInView legally) ───────

function StatBarList({ items, color }: {
  items: { rank: number; name: string; sub: string; value: number }[];
  color: string;
}) {
  const { ref, inView } = useInView();
  const max = items[0]?.value ?? 1;
  return (
    <div ref={ref}>
      {items.map((item, i) => (
        <StatBar key={item.name} rank={item.rank} name={item.name} sub={item.sub}
          value={item.value} maxValue={max} color={color} inView={inView} delay={i * 0.07} />
      ))}
    </div>
  );
}

// ─── SECTION WRAPPER ─────────────────────────────────────────────────────────

function Section({ id, title, accent, children }: {
  id?: string; title: string; accent?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-4 py-12">
      <Reveal>
        <div className="mb-8 flex items-end gap-4">
          <h2
            className="text-3xl font-bold text-white leading-none"
            style={{ fontFamily: "var(--font-kalam), cursive" }}
          >
            {title}
          </h2>
          {accent && (
            <span className="text-sm pb-1 font-semibold" style={{ color: "#4a6080", fontFamily: "var(--font-kalam), cursive" }}>
              {accent}
            </span>
          )}
        </div>
        {/* hand-drawn divider */}
        <div className="h-px mb-8" style={{ background: "linear-gradient(to right, #dc262660, #1e2a3a, transparent)", filter: "url(#sketchy)" }} />
      </Reveal>
      {children}
    </section>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const STAKE_COLORS: Record<string, string> = {
  "Champions League": "text-blue-400", "Europa": "text-orange-400",
  "Conference": "text-green-400", "relegation": "text-red-400",
  "CL if Villa": "text-purple-400", "Villa": "text-purple-400",
};
function stakeColor(stake: string) {
  for (const [key, cls] of Object.entries(STAKE_COLORS)) { if (stake.includes(key)) return cls; }
  return "text-gray-300";
}

const CHAOS_LABELS: Record<string, string> = {
  top4_boundary: "Top 4 boundary crossed", relegation_boundary: "Relegation line crossed",
  europa_boundary: "Europa spot shifted", conference_boundary: "Conference place moved",
  golden_boot_change: "Golden Boot leader changed", position_swings: "Position cascade",
};

function recapRowBg(pos: number, relegated: boolean) {
  if (pos === 1) return "bg-yellow-900/30 text-yellow-300";
  if (pos <= 4) return "bg-blue-900/20 text-blue-300";
  if (pos <= 6) return "bg-orange-900/20 text-orange-300";
  if (pos === 7) return "bg-green-900/20 text-green-300";
  if (relegated) return "bg-red-900/30 text-red-300";
  return "text-gray-300";
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function OraclePage() {

  // ── Spread state ────────────────────────────────────────────────────────
  const [spreads, setSpreads] = useState<SpreadEntry[]>([]);
  const [liveScores, setLiveScores] = useState<LiveScore[]>([]);
  const [flashingTeams, setFlashingTeams] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"spread" | "fpl">("spread");
  const [posHistory, setPosHistory] = useState<{ time: string; team: string; delta: number }[]>([]);
  const [clickedCell, setClickedCell] = useState<{ team: string; pos: number } | null>(null);
  const [mobileSheet, setMobileSheet] = useState<string | null>(null); // team name for mobile bottom sheet
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null); // clicked/locked for right panel
  const prevSpreads = useRef<Record<string, SpreadEntry>>({});

  // countdown to next poll
  const [countdown, setCountdown] = useState(POLL_INTERVAL_S);
  const lastUpdateRef = useRef(Date.now());

  // ── Preview state ────────────────────────────────────────────────────────
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Chaos state ──────────────────────────────────────────────────────────
  const [chaosData, setChaosData] = useState<ChaosData | null>(null);
  const [chaosLoading, setChaosLoading] = useState(true);

  // ── Recap state ──────────────────────────────────────────────────────────
  const [recapData, setRecapData] = useState<RecapData | null>(null);

  // ── Spread WebSocket ──────────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws/spreads");
    ws.onmessage = (e) => {
      const data: SpreadEntry[] = JSON.parse(e.data);
      lastUpdateRef.current = Date.now();
      setCountdown(POLL_INTERVAL_S);

      const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const newFlash = new Set<string>();
      const newHistory: { time: string; team: string; delta: number }[] = [];
      data.forEach((entry) => {
        const prev = prevSpreads.current[entry.team];
        if (!prev) return;
        if (JSON.stringify(prev.position_distribution) !== JSON.stringify(entry.position_distribution)) newFlash.add(entry.team);
        if (prev.current_position !== entry.current_position)
          newHistory.push({ time: now, team: entry.team, delta: prev.current_position - entry.current_position });
      });
      if (newFlash.size > 0) { setFlashingTeams(newFlash); setTimeout(() => setFlashingTeams(new Set()), 1400); }
      if (newHistory.length > 0) setPosHistory((h) => [...newHistory, ...h].slice(0, 40));
      prevSpreads.current = Object.fromEntries(data.map((e) => [e.team, e]));
      setSpreads(data);
    };
    ws.onerror = () => { fetch(`${API_BASE}/spreads`).then((r) => r.json()).then(setSpreads); };
    return () => ws.close();
  }, []);

  // ── Countdown ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const elapsed = (Date.now() - lastUpdateRef.current) / 1000;
      setCountdown(Math.max(0, POLL_INTERVAL_S - elapsed));
    }, 500);
    return () => clearInterval(t);
  }, []);

  // ── Live scores ───────────────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws");
    ws.onmessage = (e) => { const s = JSON.parse(e.data); if (s.match_states) setLiveScores(Object.values(s.match_states)); };
    return () => ws.close();
  }, []);

  // ── Preview ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/preview`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setPreviewData).catch((e) => setPreviewError(String(e)));
  }, []);

  // ── Chaos ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/chaos`).then((r) => r.json())
      .then((d) => { setChaosData(d); setChaosLoading(false); }).catch(() => setChaosLoading(false));
  }, []);

  // ── Recap ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => { fetch(`${API_BASE}/recap`).then((r) => r.json()).then(setRecapData).catch(() => {}); };
    fn(); const t = setInterval(fn, 30000); return () => clearInterval(t);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const liveScoreFor = useCallback((team: string) => {
    const match = liveScores.find((s) => s.home === team || s.away === team);
    if (!match || match.status === "NS") return null;
    const isHome = match.home === team;
    const myGoals = isHome ? match.home_goals : match.away_goals;
    const theirGoals = isHome ? match.away_goals : match.home_goals;
    const opp = isHome ? match.away : match.home;
    const min = match.status === "HT" ? "HT" : match.status === "FT" ? "FT" : `${match.minute}'`;
    return { score: `${myGoals}–${theirGoals} ${opp}`, status: min };
  }, [liveScores]);

  const hoveredEntry = spreads.find((s) => s.team === hovered) ?? spreads.find((s) => s.team === selectedTeam) ?? null;
  const ZONE_TOP_BOUNDARIES = new Set(ZONE_BOUNDARY_AFTER.map((p) => p + 1));

  const facts = previewData?.facts;
  const lore = facts?.fixture_lore ?? {};

  const goldenBoot = previewData?.key_battles.golden_boot ?? [];
  const goldenGloves = facts?.golden_gloves ?? [];
  const bootMax = goldenBoot[0]?.goals ?? 1;
  const glovesMax = goldenGloves[0]?.clean_sheets ?? 1;

  const navLinks = [
    { href: "#preview",    label: "Preview",      show: true },
    { href: "#soundboard", label: "Soundboard",   show: true },
    { href: "#map",        label: "Match Map",    show: true },
    { href: "#table",      label: "Spread Table", show: spreads.length > 0 },
    { href: "#chaos",      label: "Chaos Index",  show: true },
    { href: "#recap",      label: "Recap",        show: !!recapData?.finished },
  ];

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="text-white" style={{ backgroundColor: "#070b18" }}>

      {/* ── Sticky nav ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 px-4 py-2 bg-gray-950 border-b border-gray-800 sticky top-0 z-40">
        <span className="text-red-500 font-bold mr-4 flex-shrink-0" style={{ fontSize: "15px", letterSpacing: "-0.01em", fontFamily: "var(--font-kalam), cursive" }}>
          Anfield Oracle
        </span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {navLinks.filter((l) => l.show).map(({ href, label }) => (
            <a key={href} href={href}
              className="px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors text-gray-500 hover:text-white hover:bg-gray-800">
              {label}
            </a>
          ))}
        </div>
      </nav>


      {/* ══════════════════════════════════════════════════════════════════════
          PREVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="preview">

        {/* Hero */}
        <div className="relative text-center px-6 pt-20 pb-14 overflow-hidden"
          style={{ background: "linear-gradient(180deg, #0c0a0a 0%, #070b18 100%)" }}>
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, #dc2626 0%, transparent 70%)" }} />
          <Reveal>
            <div className="relative">
              <div className="text-xs text-gray-600 uppercase tracking-[0.3em] mb-3">Matchweek 38 · Final Day</div>
              <h1 className="text-6xl md:text-8xl font-black text-white leading-none tracking-tighter mb-6"
                style={{ fontFamily: "var(--font-kalam), cursive" }}>
                <span className="line-through opacity-30">Nothing</span>
                <span> Tons</span> is settled
                <br />
                <span className="line-through opacity-30">Everything</span>
                <span className="text-red-500"> Slot</span> is possible
              </h1>
              {previewData ? (
                <p className="text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">{previewData.day_summary}</p>
              ) : previewError ? (
                <p className="text-red-400 text-sm font-mono">{previewError}</p>
              ) : (
                <p className="text-gray-600 animate-pulse">Loading...</p>
              )}
              {previewData?.standings_incomplete && (
                <div className="mt-5 inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs px-4 py-2 rounded-lg">
                  ⚠ Standings not final — some clubs haven&apos;t completed MW37.
                </div>
              )}
            </div>
          </Reveal>
        </div>

        {/* Wild facts bar */}
        {facts && (
          <div className="border-y" style={{ borderColor: "#1a2535", backgroundColor: "#080c14" }}>
            <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {facts.wild_facts.map((f, i) => (
                <Reveal key={f.stat} delay={i * 0.07}>
                  <div className="text-center px-2">
                    <div className="text-2xl mb-1">{f.icon}</div>
                    <div className="text-xl font-black text-white leading-none" style={{ fontFamily: "var(--font-kalam), cursive" }}>{f.stat}</div>
                    <div className="text-[11px] text-gray-500 mt-1 leading-snug">{f.label}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        )}

        {/* Stakes */}
        {previewData && (
          <Section title="The Stakes" accent="everything that can still change today">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

              {/* Europe */}
              <Reveal delay={0}>
                <div className="rounded-xl p-5 h-full" style={{ background: "#080c14", border: "1px solid #1a2a4a" }}>
                  <div className="text-xs text-blue-400 uppercase tracking-widest mb-4 font-bold">🌍 European Places</div>
                  {previewData.key_battles.europe.map((entry) => {
                    const pos = entry.position;
                    const zone = pos === 1 ? { label: "PL", color: "#d4a500" }
                      : pos <= 5 ? { label: "CL", color: "#2563eb" }
                      : pos === 6 ? { label: "CL?*", color: "#7c3aed" }
                      : pos <= 8 ? { label: "EL", color: "#ea6c1a" }
                      : { label: "UECL", color: "#16a34a" };
                    return (
                      <div key={entry.team} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "#0f1929" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-black flex-shrink-0" style={{ color: zone.color }}>{zone.label}</span>
                          <span className={entry.locked ? "text-gray-500 text-sm" : "text-white text-sm"}>{entry.team}</span>
                          {entry.locked && <span className="text-[9px]" style={{ color: zone.color }}>✓</span>}
                        </div>
                        <span className="text-gray-600 text-xs flex-shrink-0">{entry.points}pts</span>
                      </div>
                    );
                  })}
                  <div className="mt-3 text-[10px] text-purple-400 leading-snug">⚠ CL? = 6th place earns CL only if Villa finish 5th — Villa already secured CL by winning the Europa League</div>
                </div>
              </Reveal>

              {/* Golden Boot */}
              <Reveal delay={0.1}>
                <div className="rounded-xl p-5 h-full" style={{ background: "#080c14", border: "1px solid #2a2010" }}>
                  <div className="text-xs text-yellow-400 uppercase tracking-widest mb-4 font-bold">👟 Golden Boot</div>
                  <StatBarList items={goldenBoot.map((e, i) => ({ rank: i + 1, name: e.player, sub: e.team, value: e.goals }))} color="#d4a500" />
                </div>
              </Reveal>

              {/* Relegation */}
              <Reveal delay={0.2}>
                <div className="rounded-xl p-5 h-full" style={{ background: "#080c14", border: "1px solid #2a1010" }}>
                  <div className="text-xs text-red-400 uppercase tracking-widest mb-4 font-bold">💀 Survival Zone</div>
                  {previewData.key_battles.relegation.map((entry) => (
                    <div key={entry.team} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "#0f1929" }}>
                      <span className={entry.position >= 18 ? "text-red-400 font-semibold text-sm" : "text-gray-300 text-sm"}>{entry.team}</span>
                      <span className="text-gray-500 text-xs">{entry.points}pts · #{entry.position}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </Section>
        )}

        {/* Golden Boot + Gloves side by side */}
        {(goldenBoot.length > 0 || goldenGloves.length > 0) && (
          <Section title="Individual Awards" accent="heading into the final day">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {goldenBoot.length > 0 && (
                <Reveal delay={0}>
                  <div className="rounded-xl p-6" style={{ background: "#080c14", border: "1px solid #2a2010" }}>
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-xl">👟</span>
                      <span className="text-sm font-bold text-yellow-400 uppercase tracking-widest">Golden Boot</span>
                    </div>
                    <StatBarList items={goldenBoot.map((e, i) => ({ rank: i + 1, name: e.player, sub: e.team, value: e.goals }))} color="#d4a500" />
                  </div>
                </Reveal>
              )}

              {goldenGloves.length > 0 && (
                <Reveal delay={0.1}>
                  <div className="rounded-xl p-6" style={{ background: "#080c14", border: "1px solid #1a2010" }}>
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-xl">🧤</span>
                      <span className="text-sm font-bold text-green-400 uppercase tracking-widest">Golden Gloves</span>
                    </div>
                    <StatBarList items={goldenGloves.map((g, i) => ({ rank: i + 1, name: g.keeper, sub: g.team, value: g.clean_sheets }))} color="#22c55e" />
                  </div>
                </Reveal>
              )}
            </div>
          </Section>
        )}

        {/* All 10 Fixtures */}
        {previewData && (
          <Section title="All 10 Fixtures" accent="simultaneous kick-off at 16:00 BST">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previewData.fixtures.map((f, i) => {
                const loreKey = `${f.home} vs ${f.away}`;
                const fl = lore[loreKey];
                return (
                  <Reveal key={loreKey} delay={(i % 2) * 0.1}>
                    <div className="rounded-xl p-5" style={{ background: "#080c14", border: "1px solid #1a2535" }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-center flex-1">
                          <div className="font-bold text-white text-sm">{f.home}</div>
                          <div className="text-xs text-gray-600">#{f.home_position} · {f.home_points}pts</div>
                        </div>
                        <div className="text-gray-700 font-bold px-3 text-xs">vs</div>
                        <div className="text-center flex-1">
                          <div className="font-bold text-white text-sm">{f.away}</div>
                          <div className="text-xs text-gray-600">#{f.away_position} · {f.away_points}pts</div>
                        </div>
                      </div>
                      <div className="space-y-0.5 mb-2">
                        {f.stakes.map((stake, j) => (
                          <div key={j} className={`text-xs ${stakeColor(stake)}`}>› {stake}</div>
                        ))}
                      </div>
                      {f.golden_boot_watch.length > 0 && (
                        <div className="text-xs text-yellow-600 mb-2">👟 {f.golden_boot_watch.join(", ")}</div>
                      )}
                      {fl?.note && (
                        <div className="mt-3 pt-3 border-t text-[11px] text-gray-500 italic leading-snug" style={{ borderColor: "#0f1929" }}>{fl.note}</div>
                      )}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Section>
        )}

        {/* History on the Line */}
        {facts?.history_on_the_line && facts.history_on_the_line.length > 0 && (
          <Section title="History on the Line" accent="records that could be written today">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {facts.history_on_the_line.map((item, i) => (
                <Reveal key={item.team} delay={(i % 2) * 0.1}>
                  <div className="rounded-xl p-5" style={{ background: "#080c14", borderLeft: `3px solid ${item.color}`, border: "1px solid #1a2535", borderLeftColor: item.color }}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{item.icon}</span>
                      <div>
                        <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: item.color }}>{item.team}</div>
                        <div className="text-white font-bold text-sm leading-snug mb-2">{item.headline}</div>
                        <div className="text-gray-500 text-xs leading-relaxed">{item.body}</div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Section>
        )}

        {/* European Pedigree */}
        {facts?.european_pedigree && (
          <Section title="European Pedigree" accent="what today means for each club">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facts.european_pedigree.map((club, i) => (
                <Reveal key={club.team} delay={(i % 3) * 0.08}>
                  <div className="rounded-xl p-5" style={{ background: "#080c14", border: "1px solid #1a2535" }}>
                    <div className="font-bold text-white text-sm mb-3" style={{ fontFamily: "var(--font-kalam), cursive" }}>{club.team}</div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-xl font-black text-blue-400">{club.cl_titles}</div>
                        <div className="text-[10px] text-gray-600 uppercase">CL titles</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-black text-gray-300">{club.cl_seasons}</div>
                        <div className="text-[10px] text-gray-600 uppercase">Euro seasons</div>
                      </div>
                      {club.el_titles > 0 && (
                        <div className="text-center">
                          <div className="text-xl font-black text-orange-400">{club.el_titles}</div>
                          <div className="text-[10px] text-gray-600 uppercase">EL titles</div>
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 leading-snug">{club.note}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Section>
        )}

      </div>{/* end #preview */}


      {/* ══════════════════════════════════════════════════════════════════════
          SOUNDBOARD
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="soundboard" title="Colby's Soundboard" accent="the things you always say">
        <Soundboard />
      </Section>


      {/* ══════════════════════════════════════════════════════════════════════
          MATCH MAP
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="map" title="Match Map" accent="10 games, 1 moment — the threads that connect them">
        <Reveal>
          <StadiumMap liveScores={liveScores} spreads={spreads} flashingTeams={flashingTeams} />
          <p className="mt-3 text-xs text-center" style={{ color: "#2a4060" }}>
            Dashed threads connect clubs straddling the same zone boundary. Pins glow on goal events.
          </p>
        </Reveal>
      </Section>


      {/* ══════════════════════════════════════════════════════════════════════
          SPREAD TABLE
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="table" className="flex flex-col" style={{ height: "100vh", borderTop: "2px solid #1a2535" }}>

        {/* Zone legend + countdown */}
        <div className="flex items-center gap-4 px-6 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #0f1929" }}>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mr-1">MW38</span>
          {ZONES.filter((z) => z.label).map((z) => (
            <span key={z.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.hex, boxShadow: `0 0 6px ${z.hex}` }} />
              <span className="text-[11px] font-semibold" style={{ color: z.hex }}>{z.short || z.label}</span>
              <span className="text-[10px]" style={{ color: "#1e3050" }}>{z.from === z.to ? z.from : `${z.from}–${z.to}`}</span>
            </span>
          ))}
          {/* Countdown bar */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <div className="relative w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#0a0f1e" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-none"
                style={{
                  width: `${(countdown / POLL_INTERVAL_S) * 100}%`,
                  background: countdown < 5 ? "#dc2626" : "#22c55e",
                  transition: "width 0.5s linear, background 0.3s ease",
                }}
              />
            </div>
            <span className="text-[10px] font-mono w-6 text-right" style={{ color: countdown < 5 ? "#dc2626" : "#2a4060" }}>
              {Math.ceil(countdown)}s
            </span>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">

          {/* Spread table */}
          <div className="flex-1 overflow-y-auto overflow-x-auto pt-3 pb-20">
          <div className="min-w-[600px] px-3 md:px-6">

            {/* Zone color bars */}
            <div className="flex mb-0.5" style={{ paddingLeft: "256px", paddingRight: "56px" }}>
              <div className="flex-1 flex h-5 rounded overflow-hidden gap-px" style={{ filter: "url(#sketchy)" }}>
                {ZONES.map((z) => {
                  const width = ((z.to - z.from + 1) / TOTAL_POSITIONS) * 100;
                  return (
                    <div key={z.from} className="flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ width: `${width}%`, backgroundColor: z.hex === "#1e2a3a" ? "#0d1520" : `${z.hex}22`, borderTop: `2px solid ${z.hex === "#1e2a3a" ? "#1a2535" : z.hex}` }}>
                      {z.short && (
                        <span className="text-[9px] font-black tracking-wider truncate px-1" style={{ color: z.hex === "#1e2a3a" ? "#2a3f5c" : z.hex }}>{z.short}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Position axis */}
            <div className="flex mb-2" style={{ paddingLeft: "256px", paddingRight: "56px" }}>
              <div className="flex-1 relative h-5">
                {[1, 5, 6, 7, 8, 9, 10, 14, 17, 18, 20].map((pos) => {
                  const z = zoneFor(pos);
                  return (
                    <span key={pos} className="absolute -translate-x-1/2 text-[10px] font-mono font-semibold"
                      style={{ left: `${((pos - 1) / (TOTAL_POSITIONS - 1)) * 100}%`, color: z.hex === "#1e2a3a" ? "#2a3f5c" : z.hex, opacity: 0.8 }}>
                      {pos}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Team rows */}
            <div>
              {spreads.map((entry) => {
                const dist = entry.position_distribution;
                const maxProb = Math.max(...Object.values(dist), 0.001);
                const isLfc = entry.team === "Liverpool";
                const isHovered = hovered === entry.team;
                const isSelected = selectedTeam === entry.team;
                const isFlashing = flashingTeams.has(entry.team);
                const zone = zoneFor(entry.current_position);
                const live = liveScoreFor(entry.team);
                const dotLeft = ((entry.current_position - 1) / (TOTAL_POSITIONS - 1)) * 100;
                const showSeparatorAbove = ZONE_TOP_BOUNDARIES.has(entry.current_position);
                const sortedDist = Object.entries(dist).sort((a, b) => b[1] - a[1]);
                const mostLikelyPos = sortedDist[0];

                return (
                  <div key={entry.team}>
                    {showSeparatorAbove && (
                      <div className="relative my-1 flex items-center" style={{ paddingLeft: "256px", paddingRight: "56px" }}>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${zone.hex}60, transparent)` }} />
                      </div>
                    )}
                    <div
                      className={`flex items-center rounded-lg cursor-pointer select-none transition-all duration-200 ${isFlashing ? "animate-pulse" : ""}`}
                      style={{
                        marginBottom: "1px",
                        backgroundColor: isHovered || isSelected ? "#0e1628" : isLfc ? "#0f0a0a" : "transparent",
                        borderLeft: isLfc ? `3px solid ${zone.hex}` : (isHovered || isSelected) ? `3px solid ${zone.hex}44` : "3px solid transparent",
                        outline: isSelected ? `1px solid ${zone.hex}88` : isFlashing ? `1px solid ${zone.hex}55` : undefined,
                      }}
                      onMouseEnter={() => { setHovered(entry.team); if (clickedCell && clickedCell.team !== entry.team) setClickedCell(null); }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => { setSelectedTeam((t) => t === entry.team ? null : entry.team); setMobileSheet(entry.team); setRightTab("spread"); }}
                    >
                      <div className="w-10 flex-shrink-0 text-center font-black text-base py-4" style={{ color: zone.hex === "#1e2a3a" ? "#2a3f5c" : zone.hex }}>
                        {entry.current_position}
                      </div>
                      <div className="w-48 flex-shrink-0 px-3 py-3">
                        <div className="font-bold text-sm leading-tight tracking-tight" style={{ color: isLfc ? "#f87171" : "#e8ecf4" }}>
                          {entry.team}
                          {entry.locked && <span className="ml-2 text-[9px] font-black tracking-widest uppercase" style={{ color: zone.hex }}>SEALED</span>}
                          {!entry.locked && entry.cl_certain && <span className="ml-2 text-[9px] font-black tracking-widest uppercase" style={{ color: "#2563eb" }}>CL ✓</span>}
                          {!entry.locked && entry.relegated_certain && <span className="ml-2 text-[9px] font-black tracking-widest uppercase" style={{ color: "#dc2626" }}>DOWN ✓</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono font-semibold" style={{ color: "#4a6080" }}>{entry.current_points}pts</span>
                          <span className="text-[10px] font-mono" style={{ color: "#2a3f5c" }}>{entry.current_gd > 0 ? "+" : ""}{entry.current_gd} GD</span>
                        </div>
                        {live && (
                          <div className="text-[10px] mt-1 font-mono truncate" style={{ color: live.status === "FT" ? "#4a6080" : live.status === "HT" ? "#6b8fa0" : "#e8ecf4" }}>
                            {live.score} <span className="font-bold" style={{ color: live.status === "FT" ? "#4a6080" : live.status === "HT" ? "#f59e0b" : "#22c55e" }}>{live.status}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 relative h-14 pr-3 py-2">
                        <div className="relative w-full h-full">
                          <div className="absolute inset-0 rounded-md" style={{ backgroundColor: "#0a0f1e" }} />
                          <div className="absolute inset-0 flex gap-[2px] p-[2px]" style={{ filter: "url(#sketchy)" }}>
                            {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
                              const pos = i + 1;
                              const prob = dist[String(pos)] ?? 0;
                              const opacity = probToOpacity(prob, maxProb);
                              const slotZone = zoneFor(pos);
                              const isCurrent = pos === entry.current_position;
                              const isMostLikely = mostLikelyPos && Number(mostLikelyPos[0]) === pos && prob > 0.25;
                              const midtableEmpty = slotZone.hex === "#1e2a3a" && prob === 0;
                              const isClicked = clickedCell?.team === entry.team && clickedCell?.pos === pos;
                              const hasScenarios = prob > 0 && entry.position_scenarios?.[String(pos)]?.length > 0;
                              return (
                                <div key={pos} className="flex-1 rounded transition-all duration-700"
                                  style={{
                                    backgroundColor: midtableEmpty ? "#0d1425" : slotZone.hex,
                                    opacity: prob === 0 ? (midtableEmpty ? 0.4 : 0.06) : opacity,
                                    transform: isCurrent ? "scaleY(1.15)" : "scaleY(1)",
                                    boxShadow: isClicked ? `0 0 0 2px white, 0 0 12px 4px ${slotZone.hex}cc`
                                      : entry.locked && isCurrent ? `0 0 14px 4px ${slotZone.hex}99`
                                      : isMostLikely ? `0 0 8px 2px ${slotZone.hex}55` : undefined,
                                    cursor: hasScenarios ? "pointer" : "default",
                                  }}
                                  onClick={(e) => { if (!hasScenarios) return; e.stopPropagation(); setClickedCell(isClicked ? null : { team: entry.team, pos }); setRightTab("spread"); }}
                                />
                              );
                            })}
                          </div>
                          {ZONE_BOUNDARY_AFTER.map((pos) => (
                            <div key={pos} className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
                              style={{ left: `${((pos - 0.5) / (TOTAL_POSITIONS - 1)) * 100}%`, background: `linear-gradient(to bottom, transparent, ${zoneFor(pos).hex}55, transparent)` }} />
                          ))}
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-500" style={{ left: `${dotLeft}%` }}>
                            <div className="rounded-full border-2 transition-all duration-500" style={{
                              width: isLfc ? "18px" : "14px", height: isLfc ? "18px" : "14px",
                              backgroundColor: zone.hex, borderColor: "#070b18",
                              boxShadow: `0 0 0 1px ${zone.hex}88, 0 0 ${isLfc ? "16px" : "8px"} ${zone.hex}99`,
                            }} />
                          </div>
                        </div>
                      </div>
                      <div className="w-14 text-center flex-shrink-0 pr-2">
                        {entry.locked ? (
                          <span className="text-xl font-bold" style={{ color: zone.hex }}>✓</span>
                        ) : (
                          <span className="text-[10px] font-mono" style={{ color: "#2a4060" }}>{entry.min_position}–{entry.max_position}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>{/* end min-w wrapper */}
          </div>

          {/* Right panel — hidden on mobile */}
          <div className="hidden md:flex w-72 flex-shrink-0 flex-col overflow-hidden" style={{ borderLeft: "1px solid #0f1929", backgroundColor: "#06090f" }}>
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid #0f1929" }}>
              {(["spread", "fpl"] as const).map((tab) => (
                <button key={tab} onClick={() => setRightTab(tab)} className="flex-1 py-3 text-[11px] font-bold uppercase tracking-widest transition"
                  style={{ color: rightTab === tab ? "#e8ecf4" : "#2a4060", borderBottom: rightTab === tab ? "2px solid #dc2626" : "2px solid transparent" }}>
                  {tab === "spread" ? "Spread" : "🏆 Brooklyn"}
                </button>
              ))}
            </div>
            {rightTab === "fpl" && <div className="flex-1 overflow-hidden py-2"><FPLPanel /></div>}
            {rightTab === "spread" && (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  {hoveredEntry ? (
                    <div>
                      <div className="flex items-start justify-between mb-0.5">
                        <div className="text-base font-black" style={{ color: zoneFor(hoveredEntry.current_position).hex, fontFamily: "var(--font-kalam), cursive" }}>{hoveredEntry.team}</div>
                        {selectedTeam === hoveredEntry.team && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#0a0f1e", color: "#4a6080" }}>📌 pinned</span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "#2a4060" }}>
                        {hoveredEntry.locked ? "Position sealed" : `Range: ${hoveredEntry.min_position}–${hoveredEntry.max_position}`}
                      </div>
                      {(() => {
                        const dist = hoveredEntry.position_distribution;
                        const maxP = Math.max(...Object.values(dist), 0.001);
                        const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
                        const mostLikely = sorted[0];
                        return (
                          <>
                            <div className="flex gap-[2px] h-20 items-end mb-3 rounded-md overflow-hidden" style={{ backgroundColor: "#0a0f1e", padding: "4px" }}>
                              {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
                                const pos = i + 1; const prob = dist[String(pos)] ?? 0;
                                const h = prob === 0 ? 3 : 8 + (prob / maxP) * 92;
                                const z = zoneFor(pos);
                                return <div key={pos} title={`Pos ${pos}: ${(prob * 100).toFixed(1)}%`} className="flex-1 rounded-t transition-all duration-700"
                                  style={{ height: `${h}%`, backgroundColor: z.hex, opacity: prob === 0 ? 0.06 : 0.25 + 0.75 * (prob / maxP) }} />;
                              })}
                            </div>
                            {mostLikely && (
                              <div className="text-sm mb-4 flex items-baseline gap-2">
                                <span style={{ color: "#4a6080" }}>Most likely</span>
                                <span className="font-black text-lg" style={{ color: zoneFor(Number(mostLikely[0])).hex }}>{mostLikely[0]}</span>
                                <span className="text-xs" style={{ color: "#4a6080" }}>{(Number(mostLikely[1]) * 100).toFixed(1)}%</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {clickedCell && clickedCell.team === hoveredEntry.team ? (() => {
                        const examples = hoveredEntry.position_scenarios?.[String(clickedCell.pos)] ?? [];
                        const posZone = zoneFor(clickedCell.pos);
                        return (
                          <div className="mt-4" style={{ borderTop: "1px solid #0f1929", paddingTop: "12px" }}>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: posZone.hex }}>How {hoveredEntry.team} finishes {clickedCell.pos}</div>
                              <button className="text-[9px] ml-auto" style={{ color: "#2a4060" }} onClick={() => setClickedCell(null)}>✕</button>
                            </div>
                            {examples.length === 0 ? <div className="text-[10px]" style={{ color: "#2a4060" }}>No scenarios available</div> : (
                              <div className="space-y-2">
                                {examples.map((combo, i) => (
                                  <div key={i} className="rounded p-2" style={{ backgroundColor: "#0a0f1e" }}>
                                    <div className="text-[9px] font-black uppercase mb-1" style={{ color: "#2a4060" }}>Scenario {i + 1}</div>
                                    <div className="flex flex-wrap gap-1">
                                      {combo.map((result, j) => {
                                        const isWin = result.endsWith(" W"); const isDraw = result.endsWith(" D");
                                        return <span key={j} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                          style={{ backgroundColor: isWin ? "#16a34a22" : isDraw ? "#d4a50022" : "#dc262622", color: isWin ? "#22c55e" : isDraw ? "#d4a500" : "#f87171" }}>{result}</span>;
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })() : !hoveredEntry.locked && (
                        <div className="space-y-2.5 text-sm pt-3" style={{ borderTop: "1px solid #0f1929" }}>
                          <div className="flex justify-between items-center">
                            <span style={{ color: "#4a6080" }}>Best case</span>
                            <span className="font-black" style={{ color: zoneFor(hoveredEntry.min_position).hex }}>
                              {hoveredEntry.min_position}{hoveredEntry.cl_certain ? " ✅" : hoveredEntry.cl_possible ? " (CL?)" : ""}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span style={{ color: "#4a6080" }}>Worst case</span>
                            <span className="font-black" style={{ color: zoneFor(hoveredEntry.max_position).hex }}>
                              {hoveredEntry.max_position}{hoveredEntry.relegated_certain ? " 💀" : hoveredEntry.relegated_possible ? " (risk)" : ""}
                            </span>
                          </div>
                          {hoveredEntry.best_case.length > 0 && (
                            <div className="mt-4" style={{ borderTop: "1px solid #0f1929", paddingTop: "12px" }}>
                              <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: "#16a34a" }}>Best case needs</div>
                              <div className="text-[11px] leading-snug" style={{ color: "#4a6080" }}>{hoveredEntry.best_case.join(" · ")}</div>
                            </div>
                          )}
                          {hoveredEntry.worst_case.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: "#dc2626" }}>Worst case if</div>
                              <div className="text-[11px] leading-snug" style={{ color: "#4a6080" }}>{hoveredEntry.worst_case.join(" · ")}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center mt-16">
                      <div className="text-2xl mb-3">◎</div>
                      <div className="text-[11px]" style={{ color: "#2a4060" }}>Hover or click a team<br />to see their spread<br /><span style={{ color: "#1e3050" }}>Click to pin it</span></div>
                    </div>
                  )}
                </div>
                <div className="p-4 h-44 overflow-y-auto flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>Live movement</div>
                  {posHistory.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "#1e3050" }}>Waiting for kick-off...</div>
                  ) : posHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="font-mono w-14" style={{ color: "#1e3050" }}>{h.time}</span>
                      <span className="flex-1 truncate" style={{ color: "#4a6080" }}>{h.team}</span>
                      <span className="font-black ml-1" style={{ color: h.delta > 0 ? "#22c55e" : "#dc2626" }}>{h.delta > 0 ? "▲" : "▼"}{Math.abs(h.delta)}</span>
                    </div>
                  ))}
                </div>
                <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>Positions sealed</div>
                  {spreads.filter((s) => s.locked).length === 0 ? (
                    <div className="text-[10px]" style={{ color: "#1e3050" }}>None yet</div>
                  ) : spreads.filter((s) => s.locked).map((s) => (
                    <div key={s.team} className="flex justify-between text-[11px]">
                      <span style={{ color: "#6b8fa0" }}>{s.team}</span>
                      <span className="font-black" style={{ color: zoneFor(s.current_position).hex }}>{s.current_position}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>{/* end #table */}

      {/* Mobile-only FPL panel (right panel hidden on small screens) */}
      <div className="md:hidden border-t" style={{ borderColor: "#0f1929", backgroundColor: "#06090f" }}>
        <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: "#2a4060", borderBottom: "1px solid #0f1929" }}>🏆 Brooklyn OLSC</div>
        <FPLPanel />
      </div>

      {/* Mobile bottom sheet — spread details for tapped team */}
      {mobileSheet && (() => {
        const entry = spreads.find((s) => s.team === mobileSheet);
        if (!entry) return null;
        const dist = entry.position_distribution;
        const maxP = Math.max(...Object.values(dist), 0.001);
        const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
        const mostLikely = sorted[0];
        const zone = zoneFor(entry.current_position);
        return (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMobileSheet(null)}>
            {/* Backdrop */}
            <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} />
            {/* Sheet */}
            <div
              className="relative rounded-t-2xl p-5 overflow-y-auto max-h-[80vh]"
              style={{ backgroundColor: "#06090f", border: "1px solid #1a2535" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: "#1a2535" }} />

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-lg font-black leading-tight" style={{ color: zone.hex, fontFamily: "var(--font-kalam), cursive" }}>{entry.team}</div>
                  <div className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "#2a4060" }}>
                    {entry.locked ? "Position sealed" : `Can finish ${entry.min_position}–${entry.max_position}`}
                  </div>
                </div>
                <button className="text-gray-600 text-xl leading-none p-1" onClick={() => setMobileSheet(null)}>✕</button>
              </div>

              {/* Mini bar chart */}
              <div className="flex gap-[2px] h-16 items-end mb-3 rounded-md overflow-hidden" style={{ backgroundColor: "#0a0f1e", padding: "4px" }}>
                {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
                  const pos = i + 1; const prob = dist[String(pos)] ?? 0;
                  const h = prob === 0 ? 3 : 8 + (prob / maxP) * 92;
                  const z = zoneFor(pos);
                  return <div key={pos} className="flex-1 rounded-t transition-all duration-700"
                    style={{ height: `${h}%`, backgroundColor: z.hex, opacity: prob === 0 ? 0.06 : 0.25 + 0.75 * (prob / maxP) }} />;
                })}
              </div>

              {mostLikely && (
                <div className="text-sm mb-4 flex items-baseline gap-2">
                  <span style={{ color: "#4a6080" }}>Most likely finish</span>
                  <span className="font-black text-xl" style={{ color: zoneFor(Number(mostLikely[0])).hex }}>{mostLikely[0]}</span>
                  <span className="text-xs" style={{ color: "#4a6080" }}>{(Number(mostLikely[1]) * 100).toFixed(1)}%</span>
                </div>
              )}

              {/* Best / worst */}
              {!entry.locked && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg p-3" style={{ backgroundColor: "#0a0f1e" }}>
                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "#16a34a" }}>Best case</div>
                    <div className="text-lg font-black" style={{ color: zoneFor(entry.min_position).hex }}>{entry.min_position}</div>
                    {entry.best_case.length > 0 && <div className="text-[10px] mt-1 leading-snug" style={{ color: "#4a6080" }}>{entry.best_case.join(" · ")}</div>}
                  </div>
                  <div className="rounded-lg p-3" style={{ backgroundColor: "#0a0f1e" }}>
                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "#dc2626" }}>Worst case</div>
                    <div className="text-lg font-black" style={{ color: zoneFor(entry.max_position).hex }}>{entry.max_position}</div>
                    {entry.worst_case.length > 0 && <div className="text-[10px] mt-1 leading-snug" style={{ color: "#4a6080" }}>{entry.worst_case.join(" · ")}</div>}
                  </div>
                </div>
              )}

              {/* Full probability breakdown */}
              <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>Full probability breakdown</div>
              <div className="grid grid-cols-4 gap-1.5">
                {sorted.filter(([, p]) => p > 0).map(([pos, prob]) => {
                  const z = zoneFor(Number(pos));
                  return (
                    <div key={pos} className="rounded p-2 text-center" style={{ backgroundColor: "#0a0f1e", borderLeft: `2px solid ${z.hex}` }}>
                      <div className="text-xs font-black" style={{ color: z.hex }}>{pos}</div>
                      <div className="text-[10px]" style={{ color: "#4a6080" }}>{(prob * 100).toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}


      {/* ══════════════════════════════════════════════════════════════════════
          CHAOS INDEX
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="chaos" style={{ borderTop: "2px solid #1a2535" }}>
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-4">
          <Reveal>
            <div className="mb-2">
              <div className="text-xs text-gray-600 uppercase tracking-widest mb-3">Season Review</div>
              <h2 className="text-4xl font-bold text-red-500" style={{ fontFamily: "var(--font-kalam), cursive" }}>The Chaos Crown</h2>
              <p className="text-gray-500 mt-2 text-sm">Every goal from every match — scored for simultaneous havoc</p>
            </div>
            <div className="h-px mt-8 mb-8" style={{ background: "linear-gradient(to right, #dc262660, #1e2a3a, transparent)", filter: "url(#sketchy)" }} />
          </Reveal>
        </div>

        {chaosLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="text-gray-500">Replaying the entire season...</div>
            <div className="flex gap-1">{[0,1,2,3,4].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
          </div>
        ) : !chaosData ? (
          <div className="text-center py-16 text-gray-600">No chaos data available.</div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 pb-16">
            {chaosData.most_chaotic_goal && (
              <Reveal>
                <div className="max-w-2xl mx-auto mb-12">
                  <div className="bg-gradient-to-br from-yellow-900/40 to-red-900/40 border border-yellow-700 rounded-2xl p-8 text-center">
                    <div className="text-yellow-500 text-xs uppercase tracking-widest mb-3">Most Chaotic Goal of the Season</div>
                    <div className="text-4xl font-black text-white mb-1" style={{ fontFamily: "var(--font-kalam), cursive" }}>{chaosData.most_chaotic_goal.scorer}</div>
                    <div className="text-gray-400 text-sm mb-4">
                      {chaosData.most_chaotic_goal.matchweek > 0 && <span className="text-yellow-700 mr-2">MW{chaosData.most_chaotic_goal.matchweek}</span>}
                      {chaosData.most_chaotic_goal.team} vs {chaosData.most_chaotic_goal.opponent} · {chaosData.most_chaotic_goal.minute}' · {chaosData.most_chaotic_goal.score_at_time}
                    </div>
                    <div className="text-yellow-300 text-5xl font-black mb-4" style={{ fontFamily: "var(--font-kalam), cursive" }}>
                      {chaosData.most_chaotic_goal.havoc_score.toFixed(1)}
                      <span className="text-xl text-yellow-700 ml-2">havoc pts</span>
                    </div>
                    {chaosData.most_chaotic_goal.ramifications && chaosData.most_chaotic_goal.ramifications.length > 0 && (
                      <div className="mb-5 bg-black/30 rounded-xl p-4 text-left max-w-xl mx-auto">
                        <div className="text-xs text-yellow-700 uppercase tracking-widest mb-2">Without this goal...</div>
                        <ul className="space-y-1">
                          {chaosData.most_chaotic_goal.ramifications.map((r, i) => (
                            <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-yellow-800 flex-shrink-0">→</span>{r} wouldn&apos;t have happened</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {chaosData.most_chaotic_goal.breakdown && (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-left max-w-md mx-auto">
                        {Object.entries(chaosData.most_chaotic_goal.breakdown).map(([key, val]) => (
                          <div key={key} className="bg-black/30 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500">{CHAOS_LABELS[key] || key}</div>
                            <div className="text-yellow-400 font-bold">+{(val as number).toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            )}
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: "var(--font-kalam), cursive" }}>Top 10 Most Chaotic Goals</h3>
            <div className="space-y-3">
              {chaosData.top_10.map((goal, i) => (
                <Reveal key={`${goal.scorer}-${i}`} delay={(i % 4) * 0.06}>
                  <div className={`rounded-xl p-4 flex gap-4 ${i === 0 ? "border border-yellow-700" : "border border-gray-800/60"}`} style={{ background: "#080c14" }}>
                    <div className="text-3xl font-black text-gray-700 w-10 text-center flex-shrink-0" style={{ fontFamily: "var(--font-kalam), cursive" }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-bold text-white truncate">{goal.scorer}</div>
                        <div className="text-yellow-400 font-bold text-sm flex-shrink-0">{goal.havoc_score.toFixed(1)} pts</div>
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {goal.matchweek > 0 && <span className="text-yellow-900 mr-1">MW{goal.matchweek} ·</span>}
                        {goal.team} vs {goal.opponent} · {goal.minute}' · {goal.score_at_time}
                      </div>
                      {goal.ramifications && goal.ramifications.length > 0 && (
                        <div className="text-xs text-gray-600">{goal.ramifications.slice(0, 2).map((r, i) => <span key={i} className="mr-2">→ {r}</span>)}</div>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>{/* end #chaos */}


      {/* ══════════════════════════════════════════════════════════════════════
          RECAP
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="recap" style={{ borderTop: "2px solid #1a2535" }}>
        {!recapData || !recapData.finished ? (
          <div className="flex items-center justify-center p-16">
            <div className="max-w-md text-center space-y-5">
              <div className="text-xs text-gray-600 uppercase tracking-widest">After the final whistle</div>
              <h2 className="text-3xl font-black text-red-500" style={{ fontFamily: "var(--font-kalam), cursive" }}>Final Reckoning</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                When all 10 matches reach full time, this section auto-generates the complete season story — final table, European spots, relegated clubs, Golden Boot winner, and a Liverpool narrative for the ages.
              </p>
              <div className="flex gap-1 justify-center">{[0,1,2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-red-900 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-5xl mx-auto">
            <Reveal>
              <header className="text-center mb-10">
                <h2 className="text-4xl font-bold text-red-500 mb-3" style={{ fontFamily: "var(--font-kalam), cursive" }}>Final Reckoning</h2>
                {recapData.champions && <div className="text-yellow-400 text-xl font-bold">🏆 {recapData.champions} — Premier League Champions</div>}
                <p className="text-gray-500 mt-3 max-w-2xl mx-auto text-sm leading-relaxed">{recapData.season_narrative}</p>
              </header>
            </Reveal>
            {recapData.liverpool_narrative && (
              <Reveal>
                <div className="max-w-2xl mx-auto mb-8 rounded-xl p-5 text-center" style={{ background: "#0a0505", border: "1px solid #7f1d1d" }}>
                  <div className="text-xs text-red-500 uppercase tracking-widest mb-2">Liverpool FC</div>
                  <div className="text-white text-sm leading-relaxed">{recapData.liverpool_narrative}</div>
                </div>
              </Reveal>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <Reveal className="lg:col-span-2">
                <div className="rounded-xl p-5" style={{ background: "#080c14", border: "1px solid #1a2535" }}>
                  <h3 className="text-lg font-bold mb-4" style={{ fontFamily: "var(--font-kalam), cursive" }}>Final Table</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-600 border-b border-gray-800 text-xs uppercase">
                      <th className="text-left py-2 w-6">#</th><th className="text-left">Team</th>
                      <th className="text-right w-8">Pts</th><th className="text-right w-10">GD</th>
                      <th className="text-left pl-3 hidden md:table-cell">Status</th>
                    </tr></thead>
                    <tbody>
                      {recapData.final_table.map((row) => (
                        <tr key={row.team} className={`border-b border-gray-800/50 ${recapRowBg(row.position, row.relegated)}`}>
                          <td className="py-1.5">{row.position}</td><td className="font-medium">{row.team}</td>
                          <td className="text-right font-bold">{row.points}</td>
                          <td className="text-right text-xs">{row.gd > 0 ? "+" : ""}{row.gd}</td>
                          <td className="pl-3 text-xs hidden md:table-cell opacity-70">{row.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Reveal>
              <div className="space-y-4">
                <Reveal delay={0.1}>
                  <div className="rounded-xl p-5" style={{ background: "#080c14", border: "1px solid #1a2535" }}>
                    <h3 className="text-sm font-bold mb-3 text-gray-500 uppercase tracking-wide">Today&apos;s Results</h3>
                    {recapData.mw38_results.map((r) => (
                      <div key={`${r.home}-${r.away}`} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm" style={{ borderColor: "#0f1929" }}>
                        <span className={r.result === "home_win" ? "text-white font-semibold" : "text-gray-600"}>{r.home}</span>
                        <span className="font-mono text-white px-2">{r.home_goals}–{r.away_goals}</span>
                        <span className={r.result === "away_win" ? "text-white font-semibold" : "text-gray-600"}>{r.away}</span>
                      </div>
                    ))}
                  </div>
                </Reveal>
                <Reveal delay={0.15}>
                  <div className="rounded-xl p-5 space-y-4" style={{ background: "#080c14", border: "1px solid #1a2535" }}>
                    {recapData.golden_boot_winner && (
                      <div>
                        <div className="text-xs text-yellow-500 uppercase tracking-wide mb-1">👟 Golden Boot</div>
                        <div className="text-white font-bold">{recapData.golden_boot_winner.player}</div>
                        <div className="text-gray-500 text-xs">{recapData.golden_boot_winner.team} · {recapData.golden_boot_winner.goals} goals</div>
                      </div>
                    )}
                    {recapData.biggest_result && (
                      <div>
                        <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">💥 Biggest Result</div>
                        <div className="text-white text-sm">{recapData.biggest_result.home} {recapData.biggest_result.home_goals}–{recapData.biggest_result.away_goals} {recapData.biggest_result.away}</div>
                      </div>
                    )}
                    {recapData.relegated.length > 0 && (
                      <div>
                        <div className="text-xs text-red-400 uppercase tracking-wide mb-1">💀 Relegated</div>
                        {recapData.relegated.map((t) => <div key={t} className="text-red-300 text-sm">{t}</div>)}
                      </div>
                    )}
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        )}
      </div>{/* end #recap */}

    </div>
  );
}
