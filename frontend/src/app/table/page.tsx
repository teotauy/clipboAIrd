"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TalkingHead, { VoiceTier } from "@/components/TalkingHead";
import FPLPanel from "@/components/FPLPanel";

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

// ─── ZONES ────────────────────────────────────────────────────────────────────

// Aston Villa won the Europa League on 2026-05-21 — this opens a 6th PL CL spot.
// PL positions 1–6 now qualify for the Champions League.
const ZONES = [
  { from: 1,  to: 1,  label: "Champions",   short: "PL",   color: "#d4a500", hex: "#d4a500" },
  { from: 2,  to: 6,  label: "Champ. Lg.",  short: "CL",   color: "#2563eb", hex: "#2563eb" },
  { from: 7,  to: 8,  label: "Europa Lg.",  short: "EL",   color: "#ea6c1a", hex: "#ea6c1a" },
  { from: 9,  to: 9,  label: "Conference",  short: "UECL", color: "#16a34a", hex: "#16a34a" },
  { from: 10, to: 17, label: "",            short: "",     color: "#1e2a3a", hex: "#1e2a3a" },
  { from: 18, to: 20, label: "Relegation",  short: "REL",  color: "#dc2626", hex: "#dc2626" },
];

function zoneFor(pos: number) {
  return ZONES.find((z) => pos >= z.from && pos <= z.to) ?? ZONES[4];
}

// Positions after which a separator line is drawn
const ZONE_BOUNDARY_AFTER = [1, 6, 8, 9, 17];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MIN_OPACITY = 0.05;

function probToOpacity(prob: number, maxProb: number): number {
  if (prob === 0) return 0;
  return MIN_OPACITY + (1 - MIN_OPACITY) * Math.pow(prob / maxProb, 0.4);
}

function eventVoiceTier(trigger: string, detail: string | null): VoiceTier {
  return ["goal", "ht", "ft"].includes(
    detail === "HT" ? "ht" : detail === "FT" ? "ft" : trigger
  )
    ? "premium"
    : "browser";
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function SpreadTable() {
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
      if (newHistory.length > 0) {
        setPosHistory((h) => [...newHistory, ...h].slice(0, 40));
      }

      prevSpreads.current = Object.fromEntries(data.map((e) => [e.team, e]));
      setSpreads(data);
    };

    ws.onerror = () => {
      fetch(`${API_BASE}/spreads`).then((r) => r.json()).then(setSpreads);
    };

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

  // ── Delphi commentary → speech queue ─────────────────────────────────────

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

  // ── Helpers ───────────────────────────────────────────────────────────────

  const liveScoreFor = (team: string): { score: string; status: string } | null => {
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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen text-white flex flex-col overflow-hidden"
      style={{ backgroundColor: "#070b18" }}
    >

      {/* ── Zone legend bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-6 px-6 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #0f1929" }}
      >
        <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mr-2">
          MW38
        </span>
        {ZONES.filter((z) => z.label).map((z) => (
          <span key={z.label} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: z.hex, boxShadow: `0 0 6px ${z.hex}` }}
            />
            <span className="text-[11px] font-medium" style={{ color: z.hex }}>
              {z.short || z.label}
            </span>
            <span className="text-[10px]" style={{ color: "#1e3050" }}>
              {z.from === z.to ? z.from : `${z.from}–${z.to}`}
            </span>
          </span>
        ))}
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Spread table ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pt-3 pb-20">

          {/* Zone color bars header */}
          <div className="flex mb-0.5" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
            <div className="flex-1 flex h-5 rounded overflow-hidden gap-px">
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
                      <span
                        className="text-[9px] font-black tracking-wider truncate px-1"
                        style={{ color: z.hex === "#1e2a3a" ? "#2a3f5c" : z.hex }}
                      >
                        {z.short}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Position axis header */}
          <div className="flex mb-2" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
            <div className="flex-1 relative h-5">
              {[1, 6, 7, 8, 9, 10, 14, 17, 18, 20].map((pos) => {
                const z = zoneFor(pos);
                return (
                  <span
                    key={pos}
                    className="absolute -translate-x-1/2 text-[10px] font-mono font-semibold"
                    style={{
                      left: `${((pos - 1) / (TOTAL_POSITIONS - 1)) * 100}%`,
                      color: z.hex === "#1e2a3a" ? "#2a3f5c" : z.hex,
                      opacity: 0.8,
                    }}
                  >
                    {pos}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Team rows */}
          <div>
            {spreads.map((entry, idx) => {
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
                  {/* Zone separator */}
                  {showSeparatorAbove && (
                    <div className="relative my-1 flex items-center" style={{ paddingLeft: "288px", paddingRight: "56px" }}>
                      <div
                        className="flex-1 h-px"
                        style={{
                          background: `linear-gradient(to right, transparent, ${zone.hex}60, transparent)`,
                        }}
                      />
                    </div>
                  )}

                  <div
                    className={`flex items-center rounded-lg cursor-pointer select-none transition-all duration-200 ${isFlashing ? "animate-pulse" : ""}`}
                    style={{
                      marginBottom: "1px",
                      backgroundColor: isHovered
                        ? "#0e1628"
                        : isLfc
                        ? "#0f0a0a"
                        : "transparent",
                      borderLeft: isLfc
                        ? `3px solid ${zone.hex}`
                        : isHovered
                        ? `3px solid ${zone.hex}44`
                        : "3px solid transparent",
                      outline: isFlashing ? `1px solid ${zone.hex}55` : undefined,
                    }}
                    onMouseEnter={() => {
                      setHovered(entry.team);
                      if (clickedCell && clickedCell.team !== entry.team) setClickedCell(null);
                    }}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Position number */}
                    <div
                      className="w-10 flex-shrink-0 text-center font-black text-base py-4"
                      style={{ color: zone.hex === "#1e2a3a" ? "#2a3f5c" : zone.hex }}
                    >
                      {entry.current_position}
                    </div>

                    {/* Team info */}
                    <div className="w-52 flex-shrink-0 px-3 py-3">
                      <div
                        className="font-bold text-sm leading-tight tracking-tight"
                        style={{ color: isLfc ? "#f87171" : "#e8ecf4" }}
                      >
                        {entry.team}
                        {entry.locked && (
                          <span
                            className="ml-2 text-[9px] font-black tracking-widest uppercase"
                            style={{ color: zone.hex }}
                          >
                            SEALED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-mono font-semibold" style={{ color: "#4a6080" }}>
                          {entry.current_points}pts
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "#2a3f5c" }}>
                          {entry.current_gd > 0 ? "+" : ""}{entry.current_gd} GD
                        </span>
                      </div>
                      {live && (
                        <div
                          className="text-[10px] mt-1 font-mono truncate"
                          style={{
                            color: live.status === "FT" ? "#4a6080" : live.status === "HT" ? "#6b8fa0" : "#e8ecf4",
                          }}
                        >
                          {live.score}{" "}
                          <span
                            className="font-bold"
                            style={{
                              color:
                                live.status === "FT"
                                  ? "#4a6080"
                                  : live.status === "HT"
                                  ? "#f59e0b"
                                  : "#22c55e",
                            }}
                          >
                            {live.status}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Probability bar ── */}
                    <div className="flex-1 relative h-14 pr-3 py-2">
                      <div className="relative w-full h-full">

                        {/* Background track */}
                        <div
                          className="absolute inset-0 rounded-md"
                          style={{ backgroundColor: "#0a0f1e" }}
                        />

                        {/* 20 probability segments */}
                        <div className="absolute inset-0 flex gap-[2px] p-[2px]">
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
                                  boxShadow: isClicked
                                    ? `0 0 0 2px white, 0 0 12px 4px ${slotZone.hex}cc`
                                    : entry.locked && isCurrent
                                    ? `0 0 14px 4px ${slotZone.hex}99`
                                    : isMostLikely
                                    ? `0 0 8px 2px ${slotZone.hex}55`
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

                        {/* Zone boundary lines */}
                        {ZONE_BOUNDARY_AFTER.map((pos) => (
                          <div
                            key={pos}
                            className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
                            style={{
                              left: `${((pos - 0.5) / (TOTAL_POSITIONS - 1)) * 100}%`,
                              background: `linear-gradient(to bottom, transparent, ${zoneFor(pos).hex}55, transparent)`,
                            }}
                          />
                        ))}

                        {/* Current position marker */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-500"
                          style={{ left: `${dotLeft}%` }}
                        >
                          <div
                            className="rounded-full border-2 transition-all duration-500"
                            style={{
                              width: isLfc ? "18px" : "14px",
                              height: isLfc ? "18px" : "14px",
                              backgroundColor: zone.hex,
                              borderColor: "#070b18",
                              boxShadow: `0 0 0 1px ${zone.hex}88, 0 0 ${isLfc ? "16px" : "8px"} ${zone.hex}99`,
                            }}
                          />
                        </div>

                      </div>
                    </div>

                    {/* Spread range */}
                    <div className="w-14 text-center flex-shrink-0 pr-2">
                      {entry.locked ? (
                        <span className="text-xl font-bold leading-none" style={{ color: zone.hex }}>✓</span>
                      ) : (
                        <span className="text-[10px] font-mono" style={{ color: "#2a4060" }}>
                          {entry.min_position}–{entry.max_position}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        <div
          className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderLeft: "1px solid #0f1929", backgroundColor: "#06090f" }}
        >

          {/* Tab bar */}
          <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid #0f1929" }}>
            {(["spread", "fpl"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className="flex-1 py-3 text-[11px] font-bold uppercase tracking-widest transition"
                style={{
                  color: rightTab === tab ? "#e8ecf4" : "#2a4060",
                  borderBottom: rightTab === tab ? "2px solid #dc2626" : "2px solid transparent",
                }}
              >
                {tab === "spread" ? "Spread" : "🏆 Brooklyn"}
              </button>
            ))}
          </div>

          {/* FPL tab */}
          {rightTab === "fpl" && (
            <div className="flex-1 overflow-hidden py-2">
              <FPLPanel />
            </div>
          )}

          {/* Spread tab */}
          {rightTab === "spread" && (
            <>
              <div className="flex-1 overflow-y-auto p-5">
                {hoveredEntry ? (
                  <div>
                    <div
                      className="text-base font-black mb-0.5 tracking-tight"
                      style={{ color: zoneFor(hoveredEntry.current_position).hex }}
                    >
                      {hoveredEntry.team}
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-widest mb-4 font-semibold"
                      style={{ color: "#2a4060" }}
                    >
                      {hoveredEntry.locked
                        ? "Position sealed"
                        : `Range: ${hoveredEntry.min_position}–${hoveredEntry.max_position}`}
                    </div>

                    {/* Histogram */}
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
                              return (
                                <div
                                  key={pos}
                                  title={`Pos ${pos}: ${(prob * 100).toFixed(1)}%`}
                                  className="flex-1 rounded-t transition-all duration-700"
                                  style={{
                                    height: `${h}%`,
                                    backgroundColor: z.hex,
                                    opacity: prob === 0 ? 0.06 : 0.25 + 0.75 * (prob / maxP),
                                  }}
                                />
                              );
                            })}
                          </div>
                          {mostLikely && (
                            <div className="text-sm mb-4 flex items-baseline gap-2">
                              <span style={{ color: "#4a6080" }}>Most likely</span>
                              <span
                                className="font-black text-lg"
                                style={{ color: zoneFor(Number(mostLikely[0])).hex }}
                              >
                                {mostLikely[0]}
                              </span>
                              <span className="text-xs" style={{ color: "#4a6080" }}>
                                {(Number(mostLikely[1]) * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Clicked-cell scenario drill-down */}
                    {clickedCell && clickedCell.team === hoveredEntry.team ? (() => {
                      const examples = hoveredEntry.position_scenarios?.[String(clickedCell.pos)] ?? [];
                      const posZone = zoneFor(clickedCell.pos);
                      return (
                        <div className="mt-4" style={{ borderTop: "1px solid #0f1929", paddingTop: "12px" }}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: posZone.hex }}>
                              How {hoveredEntry.team} finishes {clickedCell.pos}
                            </div>
                            <button
                              className="text-[9px] ml-auto"
                              style={{ color: "#2a4060" }}
                              onClick={() => setClickedCell(null)}
                            >✕</button>
                          </div>
                          {examples.length === 0 ? (
                            <div className="text-[10px]" style={{ color: "#2a4060" }}>No scenarios available</div>
                          ) : (
                            <div className="space-y-2">
                              {examples.map((combo, i) => (
                                <div key={i} className="rounded p-2" style={{ backgroundColor: "#0a0f1e" }}>
                                  <div className="text-[9px] font-black uppercase mb-1" style={{ color: "#2a4060" }}>
                                    Scenario {i + 1}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {combo.map((result, j) => {
                                      const isWin = result.endsWith(" W");
                                      const isDraw = result.endsWith(" D");
                                      return (
                                        <span
                                          key={j}
                                          className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                          style={{
                                            backgroundColor: isWin ? "#16a34a22" : isDraw ? "#d4a50022" : "#dc262622",
                                            color: isWin ? "#22c55e" : isDraw ? "#d4a500" : "#f87171",
                                          }}
                                        >
                                          {result}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      // Normal best/worst — hidden for sealed positions
                      !hoveredEntry.locked && (
                        <div className="space-y-2.5 text-sm pt-3" style={{ borderTop: "1px solid #0f1929" }}>
                          <div className="flex justify-between items-center">
                            <span style={{ color: "#4a6080" }}>Best case</span>
                            <span className="font-black" style={{ color: zoneFor(hoveredEntry.min_position).hex }}>
                              {hoveredEntry.min_position}
                              {hoveredEntry.cl_certain ? " ✅" : hoveredEntry.cl_possible ? " (CL?)" : ""}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span style={{ color: "#4a6080" }}>Worst case</span>
                            <span className="font-black" style={{ color: zoneFor(hoveredEntry.max_position).hex }}>
                              {hoveredEntry.max_position}
                              {hoveredEntry.relegated_certain ? " 💀" : hoveredEntry.relegated_possible ? " (risk)" : ""}
                            </span>
                          </div>
                          {hoveredEntry.best_case.length > 0 && (
                            <div className="mt-4" style={{ borderTop: "1px solid #0f1929", paddingTop: "12px" }}>
                              <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: "#16a34a" }}>
                                Best case needs
                              </div>
                              <div className="text-[11px] leading-snug" style={{ color: "#4a6080" }}>
                                {hoveredEntry.best_case.join(" · ")}
                              </div>
                            </div>
                          )}
                          {hoveredEntry.worst_case.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: "#dc2626" }}>
                                Worst case if
                              </div>
                              <div className="text-[11px] leading-snug" style={{ color: "#4a6080" }}>
                                {hoveredEntry.worst_case.join(" · ")}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="text-center mt-16">
                    <div className="text-2xl mb-3">◎</div>
                    <div className="text-[11px]" style={{ color: "#2a4060" }}>
                      Hover a team<br />to see their spread
                    </div>
                  </div>
                )}
              </div>

              {/* Position change log */}
              <div className="p-4 h-44 overflow-y-auto flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>
                  Live movement
                </div>
                {posHistory.length === 0 ? (
                  <div className="text-[10px]" style={{ color: "#1e3050" }}>Waiting for kick-off...</div>
                ) : (
                  posHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="font-mono w-14" style={{ color: "#1e3050" }}>{h.time}</span>
                      <span className="flex-1 truncate" style={{ color: "#4a6080" }}>{h.team}</span>
                      <span
                        className="font-black ml-1"
                        style={{ color: h.delta > 0 ? "#22c55e" : "#dc2626" }}
                      >
                        {h.delta > 0 ? "▲" : "▼"}{Math.abs(h.delta)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Sealed positions */}
              <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #0f1929" }}>
                <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#1e3050" }}>
                  Positions sealed
                </div>
                {spreads.filter((s) => s.locked).length === 0 ? (
                  <div className="text-[10px]" style={{ color: "#1e3050" }}>None yet</div>
                ) : (
                  <div className="space-y-1">
                    {spreads.filter((s) => s.locked).map((s) => (
                      <div key={s.team} className="flex justify-between text-[11px]">
                        <span style={{ color: "#6b8fa0" }}>{s.team}</span>
                        <span className="font-black" style={{ color: zoneFor(s.current_position).hex }}>
                          {s.current_position}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Commentary ticker ────────────────────────────────────────────── */}
      {speakText && (
        <div
          className="flex-shrink-0 flex items-center gap-4 px-6 py-2.5"
          style={{ borderTop: "1px solid #0f1929", backgroundColor: "#04070e" }}
        >
          <div className="text-[9px] font-black uppercase tracking-widest flex-shrink-0" style={{ color: "#dc2626" }}>
            LIVE
          </div>
          <div className="text-xs italic flex-1 truncate" style={{ color: "#6b8fa0" }}>{speakText}</div>
        </div>
      )}

      {/* ── Floating talking head ─────────────────────────────────────────── */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2 transition-all duration-300 ${
          speaking ? "opacity-100 scale-100" : "opacity-30 scale-90 hover:opacity-60"
        }`}
      >
        {speaking && speakText && (
          <div
            className="rounded-xl px-3 py-2 max-w-[220px] text-[11px] leading-snug shadow-2xl relative"
            style={{
              backgroundColor: "#0e1628",
              border: "1px solid #1e3050",
              color: "#a0b8d0",
            }}
          >
            {speakText.length > 120 ? speakText.slice(0, 117) + "…" : speakText}
            <div
              className="absolute -bottom-2 right-8 w-3 h-3 rotate-45"
              style={{ backgroundColor: "#0e1628", borderRight: "1px solid #1e3050", borderBottom: "1px solid #1e3050" }}
            />
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
