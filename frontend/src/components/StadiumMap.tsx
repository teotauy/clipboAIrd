"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// ─── STADIUM DATA ─────────────────────────────────────────────────────────────

const STADIUM_COORDS: Record<string, [number, number]> = {
  "Liverpool":           [53.4308, -2.9608],
  "Arsenal":             [51.5549, -0.1084],
  "Manchester City":     [53.4831, -2.2004],
  "Chelsea":             [51.4816, -0.1910],
  "Bournemouth":         [50.7352, -1.8383],
  "Sunderland":          [54.9148, -1.3879],
  "Brighton":            [50.8615, -0.0837],
  "Aston Villa":         [52.5090, -1.8846],
  "Nottingham Forest":   [52.9400, -1.1328],
  "Burnley":             [53.7892, -2.2301],
  "Wolves":              [52.5900, -2.1306],
  "West Ham":            [51.5386, -0.0164],
  "Tottenham":           [51.6043, -0.0665],
  "Manchester United":   [53.4631, -2.2913],
  "Brentford":           [51.4882, -0.3087],
  "Crystal Palace":      [51.3983, -0.0855],
  "Fulham":              [51.4749, -0.2217],
  "Everton":             [53.4388, -2.9668],
  "Leeds":               [53.7774, -1.5722],
  "Leicester":           [52.6204, -1.1421],
  "Ipswich":             [52.0552, 1.1446],
  "Southampton":         [50.9058, -1.3914],
  "Newcastle":           [54.9757, -1.6218],
};

// Name aliases from API-Football names → canonical names above
const NAME_ALIASES: Record<string, string> = {
  "Man City":        "Manchester City",
  "Man United":      "Manchester United",
  "Man Utd":         "Manchester United",
  "Nott'm Forest":   "Nottingham Forest",
  "Nottm Forest":    "Nottingham Forest",
  "Notts Forest":    "Nottingham Forest",
  "Spurs":           "Tottenham",
  "Wolves":          "Wolves",
  "Brighton & Hove Albion": "Brighton",
  "Brighton and Hove Albion": "Brighton",
};

function canonicalName(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

// ─── ZONE CONFIG ──────────────────────────────────────────────────────────────

// Boundary threads: pairs of zone boundaries where teams on either side compete
// { pos: the last position in the "safe" zone, color, label }
const BOUNDARIES = [
  { pos: 1,  color: "#d4a500", label: "Title race" },
  { pos: 4,  color: "#2563eb", label: "CL race" },
  { pos: 6,  color: "#7c3aed", label: "CL/EL line" },
  { pos: 8,  color: "#ea6c1a", label: "Europa line" },
  { pos: 9,  color: "#16a34a", label: "Conference line" },
  { pos: 17, color: "#dc2626", label: "Relegation line" },
];

function zoneColor(pos: number): string {
  if (pos === 1)               return "#d4a500";
  if (pos <= 4)                return "#2563eb";
  if (pos === 5)               return "#2563eb";
  if (pos === 6)               return "#7c3aed";
  if (pos <= 8)                return "#ea6c1a";
  if (pos === 9)               return "#16a34a";
  if (pos <= 17)               return "#1e2a3a";
  return "#dc2626";
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface LiveScore {
  home: string;
  away: string;
  home_goals: number;
  away_goals: number;
  minute: number;
  status: string;
}

interface SpreadEntry {
  team: string;
  current_position: number;
  min_position: number;
  max_position: number;
  locked: boolean;
}

interface StadiumMapProps {
  liveScores: LiveScore[];
  spreads: SpreadEntry[];
  flashingTeams: Set<string>;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function StadiumMap({ liveScores, spreads, flashingTeams }: StadiumMapProps) {
  const mapRef = useRef<ReturnType<typeof import("leaflet").map> | null>(null);
  const markersRef = useRef<Map<string, ReturnType<typeof import("leaflet").circleMarker>>>(new Map());
  const polylinesRef = useRef<ReturnType<typeof import("leaflet").polyline>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const radarLayerRef = useRef<ReturnType<typeof import("leaflet").tileLayer> | null>(null);
  const [radarOn, setRadarOn] = useState(true);
  const [radarAge, setRadarAge] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Build a lookup: team → position
  const posMap = Object.fromEntries(spreads.map((s) => [s.team, s.current_position]));

  // Find fixtures in play — teams with live scores
  const activeTeams = new Set<string>();
  liveScores.forEach((m) => {
    activeTeams.add(canonicalName(m.home));
    activeTeams.add(canonicalName(m.away));
  });

  // When no live scores, show all teams that have spread data
  const teamsToShow = activeTeams.size > 0 ? activeTeams : new Set(spreads.map((s) => canonicalName(s.team)));

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    import("leaflet").then((L) => {
      // Fix default icon URLs (Next.js webpack breaks them; we use CircleMarker so not needed)
      const map = L.map(containerRef.current!, {
        center: [52.7, -1.8],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 }
      ).addTo(map);

      mapRef.current = map as never;
      setMapReady(true);
    });

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).remove();
        mapRef.current = null;
        markersRef.current.clear();
        polylinesRef.current = [];
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Radar layer toggle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    import("leaflet").then(async (L) => {
      const map = mapRef.current as ReturnType<typeof L.map>;
      if (radarOn) {
        // Remove existing layer first
        if (radarLayerRef.current) { radarLayerRef.current.remove(); radarLayerRef.current = null; }
        try {
          const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
          const data = await res.json();
          const frames: { time: number; path: string }[] = data?.radar?.past ?? [];
          if (frames.length === 0) return;
          const latest = frames[frames.length - 1];
          const age = new Date(latest.time * 1000);
          const mins = Math.round((Date.now() - age.getTime()) / 60000);
          setRadarAge(`${mins}m ago`);
          const layer = L.tileLayer(
            `https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
            { opacity: 0.6, maxZoom: 19, tileSize: 256, zIndex: 500 }
          );
          layer.addTo(map);
          radarLayerRef.current = layer as never;
        } catch { /* silently skip if radar unavailable */ }
      } else {
        if (radarLayerRef.current) { radarLayerRef.current.remove(); radarLayerRef.current = null; }
        setRadarAge(null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarOn, mapReady]);

  // ── Update markers and threads whenever data changes ──────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    import("leaflet").then((L) => {
      const map = mapRef.current as ReturnType<typeof L.map>;

      // Remove old polylines
      polylinesRef.current.forEach((pl) => pl.remove());
      polylinesRef.current = [];

      // Remove stale markers (teams no longer in this fixture list)
      const keepTeams = new Set<string>();
      liveScores.forEach((m) => {
        keepTeams.add(canonicalName(m.home));
        keepTeams.add(canonicalName(m.away));
      });
      spreads.forEach((s) => keepTeams.add(canonicalName(s.team)));

      markersRef.current.forEach((marker, team) => {
        if (!keepTeams.has(team)) { marker.remove(); markersRef.current.delete(team); }
      });

      // Build score label map
      const scoreMap: Record<string, string> = {};
      const statusMap: Record<string, string> = {};
      const minuteMap: Record<string, number> = {};
      liveScores.forEach((m) => {
        const h = canonicalName(m.home);
        const a = canonicalName(m.away);
        const score = `${m.home_goals}–${m.away_goals}`;
        const min = m.status === "FT" ? "FT" : m.status === "HT" ? "HT" : `${m.minute}'`;
        scoreMap[h] = score;
        scoreMap[a] = score;
        statusMap[h] = min;
        statusMap[a] = min;
        minuteMap[h] = m.minute;
        minuteMap[a] = m.minute;
      });

      // Draw / update markers
      spreads.forEach((entry) => {
        const team = canonicalName(entry.team);
        const coords = STADIUM_COORDS[team];
        if (!coords) return;

        const pos = entry.current_position;
        const color = zoneColor(pos);
        const isFlashing = flashingTeams.has(entry.team) || flashingTeams.has(team);
        const score = scoreMap[team] ?? "";
        const status = statusMap[team] ?? "";
        const isLive = activeTeams.has(team);

        const tooltipHtml = `
          <div style="font-family: var(--font-nunito, sans-serif); text-align:center; min-width:110px">
            <div style="font-weight:700; color:${color}; font-size:13px">${team}</div>
            ${score ? `<div style="font-size:16px; font-weight:900; color:white; margin:2px 0">${score}</div>` : ""}
            ${status ? `<div style="font-size:11px; color:#aaa">${status}</div>` : ""}
            <div style="font-size:11px; color:#aaa; margin-top:3px">
              ${pos ? `#${pos}` : ""}
              ${entry.locked ? " 🔒" : ""}
              ${entry.min_position !== entry.max_position ? ` (${entry.min_position}–${entry.max_position})` : ""}
            </div>
          </div>
        `;

        if (markersRef.current.has(team)) {
          const m = markersRef.current.get(team)!;
          m.setStyle({
            color: isFlashing ? "#ffffff" : color,
            fillColor: color,
            radius: isLive ? 10 : 7,
            weight: isFlashing ? 3 : isLive ? 2 : 1,
            fillOpacity: isLive ? 0.85 : 0.45,
            opacity: 1,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m as any).getTooltip()?.setContent(tooltipHtml);
        } else {
          const marker = L.circleMarker(coords, {
            radius: isLive ? 10 : 7,
            color: color,
            fillColor: color,
            fillOpacity: isLive ? 0.85 : 0.45,
            weight: isLive ? 2 : 1,
          });
          marker.addTo(map);
          marker.bindTooltip(tooltipHtml, {
            permanent: false,
            direction: "top",
            offset: [0, -8],
            className: "stadium-tooltip",
          });
          markersRef.current.set(team, marker);
        }
      });

      // ── Draw competition threads ────────────────────────────────────────────
      // For each boundary, find teams whose spread straddles it (min ≤ pos ≤ max)
      BOUNDARIES.forEach((boundary) => {
        const straddlers = spreads.filter((s) => {
          return s.min_position <= boundary.pos + 1 && s.max_position >= boundary.pos;
        });

        if (straddlers.length < 2) return;

        // Connect all straddlers as a thin thread
        const coords: [number, number][] = straddlers
          .map((s) => STADIUM_COORDS[canonicalName(s.team)])
          .filter(Boolean);

        if (coords.length < 2) return;

        const pl = L.polyline(coords, {
          color: boundary.color,
          weight: 1.5,
          opacity: 0.5,
          dashArray: "4 6",
        });
        pl.addTo(map);
        pl.bindTooltip(boundary.label, {
          sticky: true,
          className: "stadium-tooltip",
        });
        polylinesRef.current.push(pl);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreads, liveScores, flashingTeams]);

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: "#1e2a3a", background: "#0a0f1e" }}>
      {/* Legend */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 text-[10px]">
        {BOUNDARIES.map((b) => (
          <span
            key={b.pos}
            className="px-2 py-0.5 rounded-full font-semibold"
            style={{ background: b.color + "22", color: b.color, border: `1px solid ${b.color}44` }}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {/* Radar toggle */}
        <button
          onClick={() => setRadarOn((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold transition-all"
          style={{
            background: radarOn ? "#1e3a5f" : "#0a0f1e99",
            padding: "3px 8px", borderRadius: "999px",
            border: `1px solid ${radarOn ? "#3b82f6" : "#1e2a3a"}`,
            color: radarOn ? "#93c5fd" : "#4a6080",
          }}
        >
          🌧 {radarOn ? (radarAge ?? "radar on") : "radar"}
        </button>

        {/* Live indicator */}
        {activeTeams.size > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-green-400"
            style={{ background: "#0a0f1e99", padding: "3px 8px", borderRadius: "999px", border: "1px solid #16a34a44" }}>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            {liveScores.length} live
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ height: "380px", width: "100%" }}
      />

      {/* Attribution */}
      <div className="absolute bottom-1 right-2 z-[1000] text-[9px]" style={{ color: "#2a4060" }}>
        © CartoDB · OpenStreetMap
      </div>
    </div>
  );
}
