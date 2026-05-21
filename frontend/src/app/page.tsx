"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TalkingHead, { VoiceTier } from "@/components/TalkingHead";
import FPLPanel from "@/components/FPLPanel";
import Soundboard from "@/components/Soundboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const FACE_IMAGE = "/colby.png";
const TOTAL_POSITIONS = 20;

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
  best_case: string[];
  worst_case: string[];
  spread_width: number;
  position_distribution: Record<string, number>;
  position_scenarios: Record<string, string[][]>;
}

interface LiveScore {
  home: string;
  away: string;
  home_goals: number;
  away_goals: number;
  minute: number;
  status: string;
}

interface DelphiPayload {
  narrative_summary: string;
  trigger_event: string;
  trigger_detail: string | null;
  match_minute: number;
}

interface FixturePreview {
  home: string;
  away: string;
  home_position: number | string;
  away_position: number | string;
  home_points: number | string;
  away_points: number | string;
  stakes: string[];
  golden_boot_watch: string[];
  narrative: string;
}

interface PreviewData {
  day_summary: string;
  standings_incomplete?: boolean;
  playoff_note?: string;
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
  finished: boolean;
  champions: string;
  final_table: { position: number; team: string; points: number; gd: number; gf: number; label: string; relegated: boolean }[];
  mw38_results: { home: string; away: string; home_goals: number; away_goals: number; result: string }[];
  european_spots: { position: number; team: string; competition: string }[];
  relegated: string[];
  golden_boot_winner: { player: string; team: string; goals: number } | null;
  biggest_result: { home: string; away: string; home_goals: number; away_goals: number } | null;
  liverpool_narrative: string;
  season_narrative: string;
}

interface ChaosGoal {
  scorer: string;
  team: string;
  opponent: string;
  minute: number;
  matchweek: number;
  score_at_time: string;
  havoc_score: number;
  narrative: string;
  breakdown?: Record<string, number>;
  ramifications?: string[];
}

interface ChaosData {
  most_chaotic_goal: ChaosGoal | null;
  top_10: ChaosGoal[];
}

// ─── ZONES ────────────────────────────────────────────────────────────────────

const ZONES = [
  { from: 1,  to: 1,  label: "Champions",       short: "PL",   color: "#d4a500", hex: "#d4a500" },
  { from: 2,  to: 5,  label: "Champ. Lg.",       short: "CL",   color: "#2563eb", hex: "#2563eb" },
  { from: 6,  to: 6,  label: "CL if Villa 5th", short: "CL?",  color: "#7c3aed", hex: "#7c3aed" },
  { from: 7,  to: 8,  label: "Europa Lg.",       short: "EL",   color: "#ea6c1a", hex: "#ea6c1a" },
  { from: 9,  to: 9,  label: "Conference",       short: "UECL", color: "#16a34a", hex: "#16a34a" },
  { from: 10, to: 17, label: "",                 short: "",     color: "#1e2a3a", hex: "#1e2a3a" },
  { from: 18, to: 20, label: "Relegation",       short: "REL",  color: "#dc2626", hex: "#dc2626" },
];

function zoneFor(pos: number) {
  return ZONES.find((z) => pos >= z.from && pos <= z.to) ?? ZONES[5];
}

const ZONE_BOUNDARY_AFTER = [1, 5, 6, 8, 9, 17];

const MIN_OPACITY = 0.05;

function probToOpacity(prob: number, maxProb: number): number {
  if (prob === 0) return 0;
  return MIN_OPACITY + (1 - MIN_OPACITY) * Math.pow(prob / maxProb, 0.4);
}

function eventVoiceTier(trigger: string, detail: string | null): VoiceTier {
  return ["goal", "ht", "ft"].includes(
    detail === "HT" ? "ht" : detail === "FT" ? "ft" : trigger
  ) ? "premium" : "browser";
}

// ─── PREVIEW HELPERS ──────────────────────────────────────────────────────────

const STAKE_COLORS: Record<string, string> = {
  "Champions League": "text-blue-400",
  "Europa": "text-orange-400",
  "Conference": "text-green-400",
  "relegation": "text-red-400",
  "ZONE": "text-red-500 font-bold",
  "CL if Villa": "text-purple-400",
  "Villa": "text-purple-400",
};

function stakeColor(stake: string): string {
  for (const [key, cls] of Object.entries(STAKE_COLORS)) {
    if (stake.includes(key)) return cls;
  }
  return "text-gray-300";
}

const CHAOS_LABELS: Record<string, string> = {
  top4_boundary: "Top 4 boundary crossed",
  relegation_boundary: "Relegation line crossed",
  europa_boundary: "Europa League spot shifted",
  conference_boundary: "Conference League place moved",
  golden_boot_change: "Golden Boot leader changed",
  position_swings: "Position cascade",
};

function recapRowBg(pos: number, relegated: boolean): string {
  if (pos === 1) return "bg-yellow-900/30 text-yellow-300";
  if (pos <= 4) return "bg-blue-900/20 text-blue-300";
  if (pos <= 6) return "bg-orange-900/20 text-orange-300";
  if (pos === 7) return "bg-green-900/20 text-green-300";
  if (relegated) return "bg-red-900/30 text-red-300";
  return "text-gray-300";
}

// ─── SECTION WRAPPER ─────────────────────────────────────────────────────────

function Section({ id, title, subtitle, children }: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-4 py-10 border-t border-gray-800/60">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-kalam), cursive" }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-gray-500 text-sm mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function OraclePage() {

  // ── Spread table state ──────────────────────────────────────────────────
  const [spreads, setSpreads] = useState<SpreadEntry[]>([]);
  const [liveScores, setLiveScores] = useState<LiveScore[]>([]);
  const [flashingTeams, setFlashingTeams] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"spread" | "fpl">("spread");
  const [posHistory, setPosHistory] = useState<{ time: string; team: string; delta: number }[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [speakText, setSpeakText] = useState("");
  const [voiceTier, setVoiceTier] = useState<VoiceTier>("browser");
  const [clickedCell, setClickedCell] = useState<{ team: string; pos: number } | null>(null);
  const speechQueue = useRef<DelphiPayload[]>([]);
  const processingRef = useRef(false);
  const prevSpreads = useRef<Record<string, SpreadEntry>>({});

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
      const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const newFlash = new Set<string>();
      const newHistory: { time: string; team: string; delta: number }[] = [];
      data.forEach((entry) => {
        const prev = prevSpreads.current[entry.team];
        if (!prev) return;
        if (JSON.stringify(prev.position_distribution) !== JSON.stringify(entry.position_distribution)) {
          newFlash.add(entry.team);
        }
        if (prev.current_position !== entry.current_position) {
          newHistory.push({ time: now, team: entry.team, delta: prev.current_position - entry.current_position });
        }
      });
      if (newFlash.size > 0) {
        setFlashingTeams(newFlash);
        setTimeout(() => setFlashingTeams(new Set()), 1400);
      }
      if (newHistory.length > 0) setPosHistory((h) => [...newHistory, ...h].slice(0, 40));
      prevSpreads.current = Object.fromEntries(data.map((e) => [e.team, e]));
      setSpreads(data);
    };
    ws.onerror = () => { fetch(`${API_BASE}/spreads`).then((r) => r.json()).then(setSpreads); };
    return () => ws.close();
  }, []);

  // ── Engine state (live scores) ────────────────────────────────────────────

  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws");
    ws.onmessage = (e) => {
      const state = JSON.parse(e.data);
      if (state.match_states) setLiveScores(Object.values(state.match_states));
    };
    return () => ws.close();
  }, []);

  // ── Delphi commentary ────────────────────────────────────────────────────

  const processQueue = useCallback(() => {
    const payload = speechQueue.current.shift();
    if (!payload) { processingRef.current = false; return; }
    processingRef.current = true;
    setSpeakText(payload.narrative_summary);
    setVoiceTier(eventVoiceTier(payload.trigger_event, payload.trigger_detail));
    setSpeaking(true);
  }, []);

  const onSpeakEnd = useCallback(() => {
    setSpeaking(false);
    setTimeout(processQueue, 500);
  }, [processQueue]);

  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws/delphi");
    ws.onmessage = (e) => {
      speechQueue.current.push(JSON.parse(e.data));
      if (!processingRef.current) processQueue();
    };
    return () => ws.close();
  }, [processQueue]);

  // ── Preview fetch ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API_BASE}/preview`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setPreviewData)
      .catch((e) => setPreviewError(String(e)));
  }, []);

  // ── Chaos fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API_BASE}/chaos`)
      .then((r) => r.json())
      .then((d) => { setChaosData(d); setChaosLoading(false); })
      .catch(() => setChaosLoading(false));
  }, []);

  // ── Recap fetch (polls every 30s) ────────────────────────────────────────

  useEffect(() => {
    const fetchRecap = () => {
      fetch(`${API_BASE}/recap`).then((r) => r.json()).then(setRecapData).catch(() => {});
    };
    fetchRecap();
    const interval = setInterval(fetchRecap, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const liveScoreFor = (team: string) => {
    const match = liveScores.find((s) => s.home === team || s.away === team);
    if (!match || match.status === "NS") return null;
    const isHome = match.home === team;
    const myGoals = isHome ? match.home_goals : match.away_goals;
    const theirGoals = isHome ? match.away_goals : match.home_goals;
    const opp = isHome ? match.away : match.home;
    const min = match.status === "HT" ? "HT" : match.status === "FT" ? "FT" : `${match.minute}'`;
    return { score: `${myGoals}–${theirGoals} ${opp}`, status: min };
  };

  const hoveredEntry = spreads.find((s) => s.team === hovered) ?? null;
  const ZONE_TOP_BOUNDARIES = new Set(ZONE_BOUNDARY_AFTER.map((p) => p + 1));

  const facts = previewData?.facts;
  const lore = facts?.fixture_lore ?? {};

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="text-white" style={{ backgroundColor: "#070b18" }}>

      {/* ════════════════════════════════════════════════════════════════════════
          PREVIEW — #preview
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="preview">

        {/* Hero */}
        <div
          className="relative text-center px-6 pt-16 pb-12 overflow-hidden"
          style={{ background: "linear-gradient(180deg, #0c0a0a 0%, #070b18 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, #dc2626 0%, transparent 70%)" }}
          />
          <div className="relative">
            <div className="text-xs text-gray-500 uppercase tracking-[0.3em] mb-3">Matchweek 38 · Final Day</div>
            <h1 className="text-5xl md:text-7xl font-black text-white leading-none tracking-tighter mb-6">
              THE DAY<br /><span className="text-red-500">AHEAD</span>
            </h1>
            {previewData ? (
              <p className="text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">{previewData.day_summary}</p>
            ) : previewError ? (
              <p className="text-red-400 text-sm font-mono">{previewError}</p>
            ) : (
              <p className="text-gray-600 animate-pulse">Loading the day ahead...</p>
            )}
            {previewData?.standings_incomplete && (
              <div className="mt-5 inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs px-4 py-2 rounded-lg">
                ⚠ Standings not final — some clubs haven&apos;t completed MW37.
              </div>
            )}
          </div>
        </div>

        {/* Wild facts bar */}
        {facts && (
          <div className="border-y border-gray-800/60 bg-gray-900/40">
            <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {facts.wild_facts.map((f) => (
                <div key={f.stat} className="text-center px-2">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="text-xl font-black text-white leading-none">{f.stat}</div>
                  <div className="text-[11px] text-gray-400 mt-1 leading-snug">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The Stakes */}
        {previewData && (
          <Section title="The Stakes" subtitle="Everything that can still change today">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 rounded-xl p-5 border border-blue-900/50">
                <div className="text-xs text-blue-400 uppercase tracking-widest mb-3">🌍 European Places</div>
                {previewData.key_battles.europe.map((entry) => {
                  const pos = entry.position;
                  const zone = pos === 1 ? { label: "PL", color: "#d4a500" }
                    : pos <= 5 ? { label: "CL", color: "#2563eb" }
                    : pos === 6 ? { label: "CL?", color: "#7c3aed" }
                    : pos <= 8 ? { label: "EL", color: "#ea6c1a" }
                    : { label: "UECL", color: "#16a34a" };
                  const spread = entry.min_position !== entry.max_position ? ` (${entry.min_position}–${entry.max_position})` : "";
                  return (
                    <div key={entry.team} className="text-sm py-1.5 border-b border-gray-800 last:border-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: zone.color }}>{zone.label}</span>
                        <span className={entry.locked ? "text-gray-400" : "text-white"}>{entry.team}</span>
                        {entry.locked && <span className="text-[9px] font-bold" style={{ color: zone.color }}>✓</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!entry.locked && spread && <span className="text-[10px] text-gray-600">{spread}</span>}
                        <span className="text-gray-500 text-xs">{entry.points}pts</span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 text-[10px] text-purple-400 leading-snug">
                  ⚠ CL? = Champions League only if Aston Villa finish 5th
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-5 border border-yellow-900/50">
                <div className="text-xs text-yellow-400 uppercase tracking-widest mb-3">👟 Golden Boot</div>
                {previewData.key_battles.golden_boot.map((entry, i) => (
                  <div key={entry.player} className="text-sm py-1.5 border-b border-gray-800 last:border-0 flex items-center justify-between">
                    <div>
                      <span className="text-gray-500 text-xs">{i + 1}. </span>
                      <span className="text-white font-medium">{entry.player}</span>
                      <span className="text-gray-500 text-xs ml-1">{entry.team}</span>
                    </div>
                    <span className="text-yellow-400 font-bold text-sm">{entry.goals}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900 rounded-xl p-5 border border-red-900/50">
                <div className="text-xs text-red-400 uppercase tracking-widest mb-3">💀 Survival Zone</div>
                {previewData.key_battles.relegation.map((entry) => (
                  <div key={entry.team} className="text-sm py-1.5 border-b border-gray-800 last:border-0 flex items-center justify-between">
                    <span className={entry.position >= 18 ? "text-red-400 font-semibold" : "text-gray-300"}>{entry.team}</span>
                    <span className="text-gray-400 text-xs">{entry.points}pts · #{entry.position}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* Golden Gloves */}
        {facts?.golden_gloves && (
          <Section title="Golden Gloves Race" subtitle="Clean sheet leaders heading into the final day">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {facts.golden_gloves.map((g, i) => (
                <div key={g.keeper} className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800" style={i === 0 ? { borderColor: "#ca8a04" } : {}}>
                  {i === 0 && <div className="text-yellow-400 text-xs font-bold mb-2">🧤 LEADER</div>}
                  <div className="text-2xl font-black text-white">{g.clean_sheets}</div>
                  <div className="text-[11px] text-gray-400 mt-1">clean sheets</div>
                  <div className="text-xs text-white font-semibold mt-2 leading-tight">{g.keeper}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{g.team}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* All 10 Fixtures */}
        {previewData && (
          <Section title="All 10 Fixtures" subtitle="Simultaneous kick-off at 16:00 BST">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previewData.fixtures.map((f) => {
                const loreKey = `${f.home} vs ${f.away}`;
                const fl = lore[loreKey];
                return (
                  <div key={loreKey} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-center flex-1">
                        <div className="font-bold text-white text-sm">{f.home}</div>
                        <div className="text-xs text-gray-500">#{f.home_position} · {f.home_points}pts</div>
                      </div>
                      <div className="text-gray-600 font-bold px-3">vs</div>
                      <div className="text-center flex-1">
                        <div className="font-bold text-white text-sm">{f.away}</div>
                        <div className="text-xs text-gray-500">#{f.away_position} · {f.away_points}pts</div>
                      </div>
                    </div>
                    <div className="space-y-0.5 mb-2">
                      {f.stakes.map((stake, i) => (
                        <div key={i} className={`text-xs ${stakeColor(stake)}`}>› {stake}</div>
                      ))}
                    </div>
                    {f.golden_boot_watch.length > 0 && (
                      <div className="text-xs text-yellow-500 mb-2">👟 {f.golden_boot_watch.join(", ")}</div>
                    )}
                    {fl && (
                      <div className="mt-3 pt-3 border-t border-gray-800/60">
                        <div className="text-[11px] text-gray-400 italic leading-snug">{fl.note}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* History on the Line */}
        {facts?.history_on_the_line && facts.history_on_the_line.length > 0 && (
          <Section title="History on the Line" subtitle="Records that could be written or broken today">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {facts.history_on_the_line.map((item) => (
                <div key={item.team} className="bg-gray-900 rounded-xl p-5 border border-gray-800" style={{ borderLeftColor: item.color, borderLeftWidth: "3px" }}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: item.color }}>{item.team}</div>
                      <div className="text-white font-bold text-sm leading-snug mb-2">{item.headline}</div>
                      <div className="text-gray-400 text-xs leading-relaxed">{item.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* European Pedigree */}
        {facts?.european_pedigree && (
          <Section title="European Pedigree" subtitle="The clubs fighting for continental football — and what it means for each of them">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facts.european_pedigree.map((club) => (
                <div key={club.team} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <div className="font-bold text-white text-sm mb-3">{club.team}</div>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="text-center">
                      <div className="text-xl font-black text-blue-400">{club.cl_titles}</div>
                      <div className="text-[10px] text-gray-500 uppercase">CL titles</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-black text-gray-300">{club.cl_seasons}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Euro seasons</div>
                    </div>
                    {club.el_titles > 0 && (
                      <div className="text-center">
                        <div className="text-xl font-black text-orange-400">{club.el_titles}</div>
                        <div className="text-[10px] text-gray-500 uppercase">EL titles</div>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 leading-snug">{club.note}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

      </div>{/* end #preview */}


      {/* ════════════════════════════════════════════════════════════════════════
          SOUNDBOARD — #soundboard
      ════════════════════════════════════════════════════════════════════════ */}
      <Section id="soundboard" title="Colby's Soundboard" subtitle="The things you always say. Now one click away.">
        <Soundboard />
      </Section>


      {/* ════════════════════════════════════════════════════════════════════════
          SPREAD TABLE — #table
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        id="table"
        className="flex flex-col"
        style={{ height: "100vh", borderTop: "2px solid #1e2a3a" }}
      >

        {/* Zone legend bar */}
        <div className="flex items-center gap-6 px-6 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #0f1929" }}>
          <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mr-2">MW38</span>
          {ZONES.filter((z) => z.label).map((z) => (
            <span key={z.label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.hex, boxShadow: `0 0 6px ${z.hex}` }} />
              <span className="text-[11px] font-medium" style={{ color: z.hex }}>{z.short || z.label}</span>
              <span className="text-[10px]" style={{ color: "#1e3050" }}>{z.from === z.to ? z.from : `${z.from}–${z.to}`}</span>
            </span>
          ))}
        </div>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">

          {/* Spread table */}
          <div className="flex-1 overflow-y-auto px-6 pt-3 pb-20">

            {/* Zone color bars header */}
            <div className="flex mb-0.5" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
              <div className="flex-1 flex h-5 rounded overflow-hidden gap-px" style={{ filter: "url(#sketchy)" }}>
                {ZONES.map((z) => {
                  const width = ((z.to - z.from + 1) / TOTAL_POSITIONS) * 100;
                  return (
                    <div
                      key={z.from}
                      className="flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{
                        width: `${width}%`,
                        backgroundColor: z.hex === "#1e2a3a" ? "#0d1520" : `${z.hex}22`,
                        borderTop: `2px solid ${z.hex === "#1e2a3a" ? "#1a2535" : z.hex}`,
                      }}
                    >
                      {z.short && (
                        <span className="text-[9px] font-black tracking-wider truncate px-1" style={{ color: z.hex === "#1e2a3a" ? "#2a3f5c" : z.hex }}>
                          {z.short}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Position axis */}
            <div className="flex mb-2" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
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
                      <div className="relative my-1 flex items-center" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${zone.hex}60, transparent)` }} />
                      </div>
                    )}
                    <div
                      className={`flex items-center rounded-lg cursor-pointer select-none transition-all duration-200 ${isFlashing ? "animate-pulse" : ""}`}
                      style={{
                        marginBottom: "1px",
                        backgroundColor: isHovered ? "#0e1628" : isLfc ? "#0f0a0a" : "transparent",
                        borderLeft: isLfc ? `3px solid ${zone.hex}` : isHovered ? `3px solid ${zone.hex}44` : "3px solid transparent",
                        outline: isFlashing ? `1px solid ${zone.hex}55` : undefined,
                      }}
                      onMouseEnter={() => { setHovered(entry.team); if (clickedCell && clickedCell.team !== entry.team) setClickedCell(null); }}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <div className="w-10 flex-shrink-0 text-center font-black text-base py-4" style={{ color: zone.hex === "#1e2a3a" ? "#2a3f5c" : zone.hex }}>
                        {entry.current_position}
                      </div>
                      <div className="w-52 flex-shrink-0 px-3 py-3">
                        <div className="font-bold text-sm leading-tight tracking-tight" style={{ color: isLfc ? "#f87171" : "#e8ecf4" }}>
                          {entry.team}
                          {entry.locked && <span className="ml-2 text-[9px] font-black tracking-widest uppercase" style={{ color: zone.hex }}>SEALED</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono font-semibold" style={{ color: "#4a6080" }}>{entry.current_points}pts</span>
                          <span className="text-[10px] font-mono" style={{ color: "#2a3f5c" }}>{entry.current_gd > 0 ? "+" : ""}{entry.current_gd} GD</span>
                        </div>
                        {live && (
                          <div className="text-[10px] mt-1 font-mono truncate" style={{ color: live.status === "FT" ? "#4a6080" : live.status === "HT" ? "#6b8fa0" : "#e8ecf4" }}>
                            {live.score}{" "}
                            <span className="font-bold" style={{ color: live.status === "FT" ? "#4a6080" : live.status === "HT" ? "#f59e0b" : "#22c55e" }}>
                              {live.status}
                            </span>
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
                                <div
                                  key={pos}
                                  className="flex-1 rounded transition-all duration-700 relative"
                                  style={{
                                    backgroundColor: midtableEmpty ? "#0d1425" : slotZone.hex,
                                    opacity: prob === 0 ? (midtableEmpty ? 0.4 : 0.06) : opacity,
                                    transform: isCurrent ? "scaleY(1.15)" : "scaleY(1)",
                                    boxShadow: isClicked ? `0 0 0 2px white, 0 0 12px 4px ${slotZone.hex}cc`
                                      : entry.locked && isCurrent ? `0 0 14px 4px ${slotZone.hex}99`
                                      : isMostLikely ? `0 0 8px 2px ${slotZone.hex}55`
                                      : undefined,
                                    cursor: hasScenarios ? "pointer" : "default",
                                  }}
                                  onClick={(e) => {
                                    if (!hasScenarios) return;
                                    e.stopPropagation();
                                    setClickedCell(isClicked ? null : { team: entry.team, pos });
                                    setRightTab("spread");
                                  }}
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
                              width: isLfc ? "18px" : "14px",
                              height: isLfc ? "18px" : "14px",
                              backgroundColor: zone.hex,
                              borderColor: "#070b18",
                              boxShadow: `0 0 0 1px ${zone.hex}88, 0 0 ${isLfc ? "16px" : "8px"} ${zone.hex}99`,
                            }} />
                          </div>
                        </div>
                      </div>
                      <div className="w-14 text-center flex-shrink-0 pr-2">
                        {entry.locked ? (
                          <span className="text-xl font-bold leading-none" style={{ color: zone.hex }}>✓</span>
                        ) : (
                          <span className="text-[10px] font-mono" style={{ color: "#2a4060" }}>{entry.min_position}–{entry.max_position}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel */}
          <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden" style={{ borderLeft: "1px solid #0f1929", backgroundColor: "#06090f" }}>
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid #0f1929" }}>
              {(["spread", "fpl"] as const).map((tab) => (
                <button key={tab} onClick={() => setRightTab(tab)} className="flex-1 py-3 text-[11px] font-bold uppercase tracking-widest transition"
                  style={{ color: rightTab === tab ? "#e8ecf4" : "#2a4060", borderBottom: rightTab === tab ? "2px solid #dc2626" : "2px solid transparent" }}>
                  {tab === "spread" ? "Spread" : "🏆 Brooklyn"}
                </button>
              ))}
            </div>
            {rightTab === "fpl" && (
              <div className="flex-1 overflow-hidden py-2"><FPLPanel /></div>
            )}
            {rightTab === "spread" && (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  {hoveredEntry ? (
                    <div>
                      <div className="text-base font-black mb-0.5 tracking-tight" style={{ color: zoneFor(hoveredEntry.current_position).hex }}>{hoveredEntry.team}</div>
                      <div className="text-[10px] uppercase tracking-widest mb-4 font-semibold" style={{ color: "#2a4060" }}>
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
                                const pos = i + 1;
                                const prob = dist[String(pos)] ?? 0;
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
                            {examples.length === 0 ? (
                              <div className="text-[10px]" style={{ color: "#2a4060" }}>No scenarios available</div>
                            ) : (
                              <div className="space-y-2">
                                {examples.map((combo, i) => (
                                  <div key={i} className="rounded p-2" style={{ backgroundColor: "#0a0f1e" }}>
                                    <div className="text-[9px] font-black uppercase mb-1" style={{ color: "#2a4060" }}>Scenario {i + 1}</div>
                                    <div className="flex flex-wrap gap-1">
                                      {combo.map((result, j) => {
                                        const isWin = result.endsWith(" W");
                                        const isDraw = result.endsWith(" D");
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
                      <div className="text-[11px]" style={{ color: "#2a4060" }}>Hover a team<br />to see their spread</div>
                    </div>
                  )}
                </div>
                <div className="p-4 h-44 overflow-y-auto flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>Live movement</div>
                  {posHistory.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "#1e3050" }}>Waiting for kick-off...</div>
                  ) : (
                    posHistory.map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="font-mono w-14" style={{ color: "#1e3050" }}>{h.time}</span>
                        <span className="flex-1 truncate" style={{ color: "#4a6080" }}>{h.team}</span>
                        <span className="font-black ml-1" style={{ color: h.delta > 0 ? "#22c55e" : "#dc2626" }}>{h.delta > 0 ? "▲" : "▼"}{Math.abs(h.delta)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>Positions sealed</div>
                  {spreads.filter((s) => s.locked).length === 0 ? (
                    <div className="text-[10px]" style={{ color: "#1e3050" }}>None yet</div>
                  ) : (
                    <div className="space-y-1">
                      {spreads.filter((s) => s.locked).map((s) => (
                        <div key={s.team} className="flex justify-between text-[11px]">
                          <span style={{ color: "#6b8fa0" }}>{s.team}</span>
                          <span className="font-black" style={{ color: zoneFor(s.current_position).hex }}>{s.current_position}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Commentary ticker */}
        {speakText && (
          <div className="flex-shrink-0 flex items-center gap-4 px-6 py-2.5" style={{ borderTop: "1px solid #0f1929", backgroundColor: "#04070e" }}>
            <div className="text-[9px] font-black uppercase tracking-widest flex-shrink-0" style={{ color: "#dc2626" }}>LIVE</div>
            <div className="text-xs italic flex-1 truncate" style={{ color: "#6b8fa0" }}>{speakText}</div>
          </div>
        )}
      </div>{/* end #table */}


      {/* ════════════════════════════════════════════════════════════════════════
          CHAOS INDEX — #chaos
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="chaos" style={{ borderTop: "2px solid #1e2a3a" }}>
        <div className="text-center px-6 pt-16 pb-10">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Season Review</div>
          <h2 className="text-4xl font-bold text-red-500" style={{ fontFamily: "var(--font-kalam), cursive" }}>
            The Chaos Crown
          </h2>
          <p className="text-gray-400 mt-2 text-sm">Every goal from every match this season — scored for simultaneous havoc</p>
        </div>

        {chaosLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="text-gray-400">Replaying the entire season...</div>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : !chaosData ? (
          <div className="text-center py-16 text-gray-500">No chaos data available.</div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 pb-16">
            {chaosData.most_chaotic_goal && (
              <div className="max-w-2xl mx-auto mb-12">
                <div className="bg-gradient-to-br from-yellow-900/40 to-red-900/40 border border-yellow-600 rounded-2xl p-8 text-center">
                  <div className="text-yellow-400 text-xs uppercase tracking-widest mb-3">Most Chaotic Goal of the Season</div>
                  <div className="text-4xl font-black text-white mb-1">{chaosData.most_chaotic_goal.scorer}</div>
                  <div className="text-gray-400 text-sm mb-4">
                    {chaosData.most_chaotic_goal.matchweek > 0 && <span className="text-yellow-700 mr-2">MW{chaosData.most_chaotic_goal.matchweek}</span>}
                    {chaosData.most_chaotic_goal.team} vs {chaosData.most_chaotic_goal.opponent} · {chaosData.most_chaotic_goal.minute}' · {chaosData.most_chaotic_goal.score_at_time}
                  </div>
                  <div className="text-yellow-300 text-5xl font-black mb-4">
                    {chaosData.most_chaotic_goal.havoc_score.toFixed(1)}
                    <span className="text-xl text-yellow-600 ml-2">havoc pts</span>
                  </div>
                  {chaosData.most_chaotic_goal.ramifications && chaosData.most_chaotic_goal.ramifications.length > 0 && (
                    <div className="mb-5 bg-black/30 rounded-xl p-4 text-left max-w-xl mx-auto">
                      <div className="text-xs text-yellow-600 uppercase tracking-widest mb-2">Without this goal...</div>
                      <ul className="space-y-1">
                        {chaosData.most_chaotic_goal.ramifications.map((r, i) => (
                          <li key={i} className="text-sm text-gray-300 flex gap-2">
                            <span className="text-yellow-700 flex-shrink-0">→</span>
                            {r} wouldn&apos;t have happened
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {chaosData.most_chaotic_goal.breakdown && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-left max-w-md mx-auto">
                      {Object.entries(chaosData.most_chaotic_goal.breakdown).map(([key, val]) => (
                        <div key={key} className="bg-black/30 rounded-lg px-3 py-2">
                          <div className="text-xs text-gray-400">{CHAOS_LABELS[key] || key}</div>
                          <div className="text-yellow-400 font-bold">+{(val as number).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <h3 className="text-xl font-bold mb-4">Top 10 Most Chaotic Goals</h3>
            <div className="space-y-3">
              {chaosData.top_10.map((goal, i) => (
                <div key={`${goal.scorer}-${goal.minute}-${i}`}
                  className={`bg-gray-900 rounded-xl p-4 border flex gap-4 ${i === 0 ? "border-yellow-600" : "border-gray-800"}`}>
                  <div className="text-3xl font-black text-gray-700 w-10 text-center flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-bold text-white truncate">{goal.scorer}</div>
                      <div className="text-yellow-400 font-bold text-sm flex-shrink-0">{goal.havoc_score.toFixed(1)} pts</div>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">
                      {goal.matchweek > 0 && <span className="text-yellow-800 mr-1">MW{goal.matchweek} ·</span>}
                      {goal.team} vs {goal.opponent} · {goal.minute}' · {goal.score_at_time}
                    </div>
                    {goal.ramifications && goal.ramifications.length > 0 && (
                      <div className="text-xs text-gray-500 mb-1">
                        {goal.ramifications.slice(0, 2).map((r, i) => <span key={i} className="mr-2">→ {r}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>{/* end #chaos */}


      {/* ════════════════════════════════════════════════════════════════════════
          RECAP — #recap
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="recap" style={{ borderTop: "2px solid #1e2a3a" }}>
        {!recapData ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-gray-500 animate-pulse">Waiting for full time...</div>
          </div>
        ) : !recapData.finished ? (
          <div className="flex items-center justify-center p-16">
            <div className="max-w-md text-center space-y-6">
              <div className="text-xs text-gray-600 uppercase tracking-widest">After the final whistle</div>
              <h2 className="text-3xl font-black text-red-500" style={{ fontFamily: "var(--font-kalam), cursive" }}>Final Reckoning</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                When all 10 matches hit full time, this section auto-generates the complete season story — final table, confirmed European spots, relegated clubs, Golden Boot winner, biggest result, and a Liverpool narrative for the ages.
              </p>
              <p className="text-gray-600 text-xs leading-relaxed">Brooklyn OLSC fantasy league results land here too.</p>
              <div className="flex gap-1 justify-center pt-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-red-800 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <header className="text-center mb-10">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Season Complete</div>
              <h2 className="text-4xl font-bold text-red-500" style={{ fontFamily: "var(--font-kalam), cursive" }}>Final Reckoning</h2>
              {recapData.champions && (
                <div className="text-yellow-400 text-xl font-bold mt-3">🏆 {recapData.champions} — Premier League Champions</div>
              )}
              <p className="text-gray-400 mt-3 max-w-2xl mx-auto text-sm leading-relaxed">{recapData.season_narrative}</p>
            </header>
            {recapData.liverpool_narrative && (
              <div className="max-w-2xl mx-auto mb-8 bg-red-950/40 border border-red-800 rounded-xl p-5 text-center">
                <div className="text-xs text-red-400 uppercase tracking-widest mb-2">Liverpool FC</div>
                <div className="text-white text-sm leading-relaxed">{recapData.liverpool_narrative}</div>
              </div>
            )}
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 bg-gray-900 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">Final Table</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800 text-xs uppercase">
                      <th className="text-left py-2 w-6">#</th>
                      <th className="text-left">Team</th>
                      <th className="text-right w-8">Pts</th>
                      <th className="text-right w-10">GD</th>
                      <th className="text-left pl-3 hidden md:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recapData.final_table.map((row) => (
                      <tr key={row.team} className={`border-b border-gray-800/50 ${recapRowBg(row.position, row.relegated)}`}>
                        <td className="py-1.5">{row.position}</td>
                        <td className="font-medium">{row.team}</td>
                        <td className="text-right font-bold">{row.points}</td>
                        <td className="text-right text-xs">{row.gd > 0 ? "+" : ""}{row.gd}</td>
                        <td className="pl-3 text-xs hidden md:table-cell opacity-80">{row.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-3 text-gray-400 uppercase tracking-wide">Today&apos;s Results</h3>
                  {recapData.mw38_results.map((r) => (
                    <div key={`${r.home}-${r.away}`} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0 text-sm">
                      <span className={r.result === "home_win" ? "text-white font-semibold" : "text-gray-500"}>{r.home}</span>
                      <span className="font-mono text-white px-2">{r.home_goals}–{r.away_goals}</span>
                      <span className={r.result === "away_win" ? "text-white font-semibold" : "text-gray-500"}>{r.away}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-900 rounded-xl p-5 space-y-4">
                  {recapData.golden_boot_winner && (
                    <div>
                      <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">👟 Golden Boot</div>
                      <div className="text-white font-bold">{recapData.golden_boot_winner.player}</div>
                      <div className="text-gray-500 text-xs">{recapData.golden_boot_winner.team} · {recapData.golden_boot_winner.goals} goals</div>
                    </div>
                  )}
                  {recapData.biggest_result && (
                    <div>
                      <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">💥 Biggest Result Today</div>
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
              </div>
            </div>
          </div>
        )}
      </div>{/* end #recap */}

      {/* ── Floating talking head (visible across all sections) ────────────── */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2 transition-all duration-300 ${
          speaking ? "opacity-100 scale-100" : "opacity-30 scale-90 hover:opacity-60"
        }`}
      >
        {speaking && speakText && (
          <div className="rounded-xl px-3 py-2 max-w-[220px] text-[11px] leading-snug shadow-2xl relative"
            style={{ backgroundColor: "#0e1628", border: "1px solid #1e3050", color: "#a0b8d0" }}>
            {speakText.length > 120 ? speakText.slice(0, 117) + "…" : speakText}
            <div className="absolute -bottom-2 right-8 w-3 h-3 rotate-45"
              style={{ backgroundColor: "#0e1628", borderRight: "1px solid #1e3050", borderBottom: "1px solid #1e3050" }} />
          </div>
        )}
        <TalkingHead
          faceImageUrl={FACE_IMAGE}
          text={speakText}
          isSpeaking={speaking}
          voiceTier={voiceTier}
          onSpeakEnd={onSpeakEnd}
          size="sm"
        />
      </div>

    </div>
  );
}
