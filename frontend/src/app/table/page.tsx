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

const ZONES = [
  { from: 1,  to: 1,  label: "Champions",  color: "#c0a000", hex: "#c0a000" },
  { from: 2,  to: 4,  label: "CL",         color: "#1a6fc4", hex: "#1a6fc4" },
  { from: 5,  to: 6,  label: "Europa",     color: "#e07b20", hex: "#e07b20" },
  { from: 7,  to: 7,  label: "Conference", color: "#2da44e", hex: "#2da44e" },
  { from: 8,  to: 17, label: "",           color: "#374151", hex: "#374151" },
  { from: 18, to: 20, label: "Rel.",       color: "#c0392b", hex: "#c0392b" },
];

function zoneFor(pos: number) {
  return ZONES.find((z) => pos >= z.from && pos <= z.to) ?? ZONES[4];
}

const ZONE_BOUNDARY_POSITIONS = [1, 4, 6, 7, 17]; // lines drawn after these

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MIN_OPACITY = 0.06;

function probToOpacity(prob: number, maxProb: number): number {
  if (prob === 0) return 0;
  return MIN_OPACITY + (1 - MIN_OPACITY) * Math.pow(prob / maxProb, 0.45);
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

  // Talking head state
  const [speaking, setSpeaking] = useState(false);
  const [speakText, setSpeakText] = useState("");
  const [voiceTier, setVoiceTier] = useState<VoiceTier>("browser");
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

        // Distribution changed — flash the row
        const prevDist = JSON.stringify(prev.position_distribution);
        const newDist = JSON.stringify(entry.position_distribution);
        if (prevDist !== newDist) newFlash.add(entry.team);

        // Position changed — log it
        if (prev.current_position !== entry.current_position) {
          newHistory.push({
            time: now,
            team: entry.team,
            delta: prev.current_position - entry.current_position,
          });
        }
      });

      if (newFlash.size > 0) {
        setFlashingTeams(newFlash);
        setTimeout(() => setFlashingTeams(new Set()), 1200);
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
      if (state.match_states) {
        setLiveScores(Object.values(state.match_states));
      }
    };
    return () => ws.close();
  }, []);

  // ── Delphi commentary feed → speech queue ─────────────────────────────────

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

  const liveScoreFor = (team: string): string | null => {
    const match = liveScores.find(
      (s) => s.home === team || s.away === team
    );
    if (!match || match.status === "NS") return null;
    const isHome = match.home === team;
    const myGoals = isHome ? match.home_goals : match.away_goals;
    const theirGoals = isHome ? match.away_goals : match.home_goals;
    const opp = isHome ? match.away : match.home;
    const min = match.status === "HT" ? "HT" : match.status === "FT" ? "FT" : `${match.minute}'`;
    return `${myGoals}–${theirGoals} ${opp} (${min})`;
  };

  const hoveredEntry = spreads.find((s) => s.team === hovered) ?? null;

  // ── Zone boundary row positions (which rows get a separator above them) ───
  // Positions 5, 7, 8, 18 get a zone line drawn above them
  const ZONE_TOP_BOUNDARIES = new Set([2, 5, 7, 8, 18]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-xl font-black text-red-500 tracking-tight">ANFIELD ORACLE</h1>
          <p className="text-[11px] text-gray-500 -mt-0.5">Matchweek 38 · Position Spread Matrix</p>
        </div>
        <div className="flex items-center gap-6 text-xs text-gray-500">
          {ZONES.filter((z) => z.label).map((z) => (
            <span key={z.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: z.hex, opacity: 0.8 }} />
              {z.label}
              <span className="text-gray-700">({z.from}{z.from !== z.to ? `–${z.to}` : ""})</span>
            </span>
          ))}
          <a href="/preview" className="text-gray-600 hover:text-gray-300 transition">Preview</a>
          <a href="/recap" className="text-gray-600 hover:text-gray-300 transition">Recap</a>
          <a href="/chaos" className="text-gray-600 hover:text-gray-300 transition">Chaos</a>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-2">

          {/* Position axis */}
          <div className="flex mb-1 pl-[280px] pr-[52px]">
            <div className="flex-1 relative h-4">
              {[1, 4, 5, 6, 7, 10, 14, 17, 18, 20].map((pos) => (
                <span
                  key={pos}
                  className="absolute -translate-x-1/2 text-[10px] font-mono"
                  style={{
                    left: `${((pos - 1) / (TOTAL_POSITIONS - 1)) * 100}%`,
                    color: zoneFor(pos).hex,
                    opacity: 0.7,
                  }}
                >
                  {pos}
                </span>
              ))}
              {/* Zone boundary tick marks */}
              {ZONE_BOUNDARY_POSITIONS.map((pos) => (
                <div
                  key={pos}
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    left: `${((pos - 0.5) / (TOTAL_POSITIONS - 1)) * 100}%`,
                    backgroundColor: zoneFor(pos).hex,
                    opacity: 0.2,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {spreads.map((entry) => {
              const dist = entry.position_distribution;
              const maxProb = Math.max(...Object.values(dist), 0.001);
              const isLfc = entry.team === "Liverpool";
              const isHovered = hovered === entry.team;
              const isFlashing = flashingTeams.has(entry.team);
              const zone = zoneFor(entry.current_position);
              const liveScore = liveScoreFor(entry.team);
              const dotLeft = ((entry.current_position - 1) / (TOTAL_POSITIONS - 1)) * 100;
              const showBoundaryAbove = ZONE_TOP_BOUNDARIES.has(entry.current_position);
              const mostLikelyPos = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];

              return (
                <div key={entry.team}>
                  {/* Zone divider line */}
                  {showBoundaryAbove && (
                    <div
                      className="h-px my-1 mx-0"
                      style={{ backgroundColor: zone.hex, opacity: 0.25 }}
                    />
                  )}

                  <div
                    className={`
                      flex items-center rounded transition-all duration-200 cursor-pointer select-none
                      ${isFlashing ? "animate-pulse" : ""}
                      ${isHovered ? "bg-gray-800/80" : isLfc ? "bg-red-950/20" : "hover:bg-gray-900/60"}
                    `}
                    style={{
                      borderLeft: isLfc ? `3px solid ${zone.hex}` : "3px solid transparent",
                      outline: isFlashing ? `1px solid ${zone.hex}44` : undefined,
                    }}
                    onMouseEnter={() => setHovered(entry.team)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Position number */}
                    <div
                      className="w-9 text-center text-sm font-black flex-shrink-0 py-3"
                      style={{ color: zone.hex }}
                    >
                      {entry.current_position}
                    </div>

                    {/* Team info */}
                    <div className="w-44 flex-shrink-0 px-2 py-1.5">
                      <div className={`text-sm font-semibold leading-tight ${isLfc ? "text-red-400" : "text-white"}`}>
                        {entry.team}
                        {entry.locked && (
                          <span
                            className="ml-1.5 text-[9px] font-bold tracking-widest"
                            style={{ color: zone.hex }}
                          >
                            SEALED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500 font-mono">
                          {entry.current_points}pts
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono">
                          {entry.current_gd > 0 ? "+" : ""}{entry.current_gd}
                        </span>
                      </div>
                      {liveScore && (
                        <div className="text-[9px] text-gray-500 mt-0.5 truncate leading-tight">
                          {liveScore}
                        </div>
                      )}
                    </div>

                    {/* ── Probability heat-map ── */}
                    <div className="flex-1 relative h-12 py-2 pr-3">
                      <div className="relative w-full h-full flex items-center">

                        {/* 20 position slots */}
                        <div className="absolute inset-0 flex gap-[1px] items-stretch">
                          {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
                            const pos = i + 1;
                            const prob = dist[String(pos)] ?? 0;
                            const opacity = probToOpacity(prob, maxProb);
                            const slotZone = zoneFor(pos);
                            const isCurrent = pos === entry.current_position;
                            const isMostLikely = mostLikelyPos && Number(mostLikelyPos[0]) === pos;

                            return (
                              <div
                                key={pos}
                                className="flex-1 rounded-sm transition-all duration-700 relative"
                                style={{
                                  backgroundColor: slotZone.hex,
                                  opacity: prob === 0 ? 0.04 : opacity,
                                  transform: isCurrent ? "scaleY(1.25)" : "scaleY(1)",
                                  boxShadow:
                                    entry.locked && isCurrent
                                      ? `0 0 10px 3px ${slotZone.hex}88`
                                      : isMostLikely && prob > 0.3
                                      ? `0 0 6px 1px ${slotZone.hex}44`
                                      : undefined,
                                }}
                              />
                            );
                          })}
                        </div>

                        {/* Zone boundary lines overlaid on bar */}
                        {ZONE_BOUNDARY_POSITIONS.map((pos) => (
                          <div
                            key={pos}
                            className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
                            style={{
                              left: `${((pos - 0.5) / (TOTAL_POSITIONS - 1)) * 100}%`,
                              backgroundColor: zoneFor(pos).hex,
                              opacity: 0.3,
                            }}
                          />
                        ))}

                        {/* Current position dot */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 transition-all duration-500 pointer-events-none"
                          style={{ left: `${dotLeft}%` }}
                        >
                          <div
                            className="w-3 h-3 rounded-full border-2 border-gray-950"
                            style={{
                              backgroundColor: zone.hex,
                              boxShadow: `0 0 0 1px ${zone.hex}, 0 0 ${isLfc ? "8px" : "4px"} ${zone.hex}99`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Spread width pill */}
                    <div className="w-12 text-center flex-shrink-0 pr-2">
                      {entry.locked ? (
                        <span style={{ color: zone.hex }} className="text-lg leading-none">✓</span>
                      ) : (
                        <span className="text-[10px] text-gray-600 font-mono">
                          {entry.min_position}–{entry.max_position}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-16" /> {/* Breathing room above ticker */}
        </div>

        {/* ── Right panel ─────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-l border-gray-800 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-gray-800 flex-shrink-0">
            {(["spread", "fpl"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                  rightTab === tab
                    ? "text-white border-b-2 border-red-500"
                    : "text-gray-600 hover:text-gray-400"
                }`}
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

          {/* Spread tab — all three sections in one conditional */}
          {rightTab === "spread" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                {hoveredEntry ? (
                  <div>
                    <div className="font-bold text-base mb-0.5" style={{ color: zoneFor(hoveredEntry.current_position).hex }}>
                      {hoveredEntry.team}
                    </div>
                    <div className="text-[10px] text-gray-500 mb-3 uppercase tracking-wide">
                      {hoveredEntry.locked ? "Position sealed" : `Spread: ${hoveredEntry.min_position}–${hoveredEntry.max_position}`}
                    </div>

                    {/* Histogram */}
                    {(() => {
                      const dist = hoveredEntry.position_distribution;
                      const maxP = Math.max(...Object.values(dist), 0.001);
                      const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
                      const mostLikely = sorted[0];
                      return (
                        <>
                          <div className="flex gap-[2px] h-16 items-end mb-2">
                            {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
                              const pos = i + 1;
                              const prob = dist[String(pos)] ?? 0;
                              const h = prob === 0 ? 2 : 6 + (prob / maxP) * 94;
                              const z = zoneFor(pos);
                              return (
                                <div
                                  key={pos}
                                  title={`Pos ${pos}: ${(prob * 100).toFixed(1)}%`}
                                  className="flex-1 rounded-t-sm transition-all duration-700"
                                  style={{
                                    height: `${h}%`,
                                    backgroundColor: z.hex,
                                    opacity: prob === 0 ? 0.08 : 0.3 + 0.7 * (prob / maxP),
                                  }}
                                />
                              );
                            })}
                          </div>
                          {mostLikely && (
                            <div className="text-xs mb-3">
                              <span className="text-gray-400">Most likely: </span>
                              <span className="font-bold" style={{ color: zoneFor(Number(mostLikely[0])).hex }}>
                                {mostLikely[0]}
                              </span>
                              <span className="text-gray-500 text-[10px]">
                                {" "}({(Number(mostLikely[1]) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div className="space-y-2 text-xs border-t border-gray-800 pt-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Best case</span>
                        <span className="font-bold" style={{ color: zoneFor(hoveredEntry.min_position).hex }}>
                          {hoveredEntry.min_position}
                          {hoveredEntry.cl_certain ? " ✅" : hoveredEntry.cl_possible ? " (CL?)" : ""}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Worst case</span>
                        <span className="font-bold" style={{ color: zoneFor(hoveredEntry.max_position).hex }}>
                          {hoveredEntry.max_position}
                          {hoveredEntry.relegated_certain ? " 💀" : hoveredEntry.relegated_possible ? " (risk)" : ""}
                        </span>
                      </div>
                    </div>

                    {hoveredEntry.best_case.length > 0 && (
                      <div className="mt-3 border-t border-gray-800 pt-3">
                        <div className="text-[9px] text-green-500 uppercase tracking-wide mb-1">Best case needs</div>
                        <div className="text-[10px] text-gray-400 leading-snug">{hoveredEntry.best_case.join(" · ")}</div>
                      </div>
                    )}
                    {hoveredEntry.worst_case.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[9px] text-red-500 uppercase tracking-wide mb-1">Worst case if</div>
                        <div className="text-[10px] text-gray-400 leading-snug">{hoveredEntry.worst_case.join(" · ")}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-700 text-xs text-center mt-12">
                    Hover a team<br />to see their spread
                  </div>
                )}
              </div>

              {/* Position change log */}
              <div className="border-t border-gray-800 p-4 h-48 overflow-y-auto flex-shrink-0">
                <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Live movement</div>
                {posHistory.length === 0 ? (
                  <div className="text-gray-700 text-[10px]">Waiting...</div>
                ) : (
                  posHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="text-gray-700 font-mono w-14">{h.time}</span>
                      <span className="text-gray-400 flex-1 truncate">{h.team}</span>
                      <span className={`font-bold ml-1 ${h.delta > 0 ? "text-green-500" : "text-red-500"}`}>
                        {h.delta > 0 ? "▲" : "▼"}{Math.abs(h.delta)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Sealed positions */}
              <div className="border-t border-gray-800 p-4 flex-shrink-0">
                <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Positions sealed</div>
                {spreads.filter((s) => s.locked).length === 0 ? (
                  <div className="text-gray-700 text-[10px]">None yet</div>
                ) : (
                  <div className="space-y-0.5">
                    {spreads.filter((s) => s.locked).map((s) => (
                      <div key={s.team} className="flex justify-between text-[11px]">
                        <span className="text-gray-300">{s.team}</span>
                        <span className="font-bold" style={{ color: zoneFor(s.current_position).hex }}>
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

      {/* ── Commentary ticker ────────────────────────────────────────── */}
      {speakText && (
        <div className="border-t border-gray-800 bg-gray-900/80 px-4 py-2 flex-shrink-0 flex items-center gap-3">
          <div className="text-[9px] text-red-500 uppercase tracking-widest flex-shrink-0 font-bold">
            LIVE
          </div>
          <div className="text-xs text-gray-300 truncate italic flex-1">{speakText}</div>
        </div>
      )}

      {/* ── Floating talking head ─────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-6 right-6 z-50
          flex flex-col items-center gap-2
          transition-all duration-300
          ${speaking ? "opacity-100 scale-100" : "opacity-40 scale-90 hover:opacity-70"}
        `}
      >
        {/* Speech bubble */}
        {speaking && speakText && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 max-w-[220px] text-[11px] text-gray-200 leading-snug shadow-2xl relative">
            {speakText.length > 120 ? speakText.slice(0, 117) + "…" : speakText}
            <div className="absolute -bottom-2 right-8 w-3 h-3 bg-gray-900 border-r border-b border-gray-700 rotate-45" />
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
