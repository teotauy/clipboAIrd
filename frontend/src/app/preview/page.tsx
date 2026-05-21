"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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
}

const STAKE_COLORS: Record<string, string> = {
  "Champions League": "text-blue-400",
  "Europa": "text-orange-400",
  "Conference": "text-green-400",
  "relegation": "text-red-400",
  "ZONE": "text-red-500 font-bold",
};

function stakeColor(stake: string): string {
  for (const [key, cls] of Object.entries(STAKE_COLORS)) {
    if (stake.includes(key)) return cls;
  }
  return "text-gray-300";
}

export default function PreviewPage() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/preview`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-red-400 text-sm font-mono">Error: {error}<br/>API: {API_BASE}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 animate-pulse">Loading the day ahead...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <header className="text-center mb-10">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Matchweek 38</div>
        <h1 className="text-4xl font-bold text-red-500">THE DAY AHEAD</h1>
        <p className="text-gray-400 mt-3 max-w-2xl mx-auto text-sm leading-relaxed">
          {data.day_summary}
        </p>
        {data.standings_incomplete && (
          <div className="mt-4 inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs px-4 py-2 rounded-lg">
            ⚠ Standings not final — some clubs have not completed MW37. Re-run stage setup when all results are in.
          </div>
        )}
        {data.playoff_note && (
          <div className="mt-4 inline-block bg-blue-900/40 border border-blue-700 text-blue-300 text-xs px-4 py-2 rounded-lg max-w-2xl">
            {data.playoff_note}
          </div>
        )}
      </header>

      {/* Key Battles */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {/* Europe race */}
        <div className="bg-gray-900 rounded-xl p-5 border border-blue-900">
          <div className="text-xs text-blue-400 uppercase tracking-widest mb-3">
            🌍 European Places
          </div>
          {data.key_battles.europe.map((entry) => {
            const zone =
              entry.position === 1 ? { label: "PL", color: "#d4a500" }
              : entry.position <= 5 ? { label: "CL", color: "#2563eb" }
              : entry.position <= 7 ? { label: "EL", color: "#ea6c1a" }
              : { label: "UCL Q", color: "#16a34a" };
            const spread = entry.min_position !== entry.max_position
              ? ` (${entry.min_position}–${entry.max_position})`
              : "";
            return (
              <div key={entry.team} className="text-sm py-1.5 border-b border-gray-800 last:border-0 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold flex-shrink-0" style={{ color: zone.color }}>
                    {zone.label}
                  </span>
                  <span className={entry.locked ? "text-gray-400 line-through" : "text-white"}>
                    {entry.team}
                  </span>
                  {entry.locked && (
                    <span className="text-[9px] font-bold" style={{ color: zone.color }}>✓</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!entry.locked && spread && (
                    <span className="text-[10px]" style={{ color: "#2a4060" }}>{spread}</span>
                  )}
                  <span className="text-gray-500 text-xs">{entry.points}pts</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Golden Boot */}
        <div className="bg-gray-900 rounded-xl p-5 border border-yellow-900">
          <div className="text-xs text-yellow-400 uppercase tracking-widest mb-3">
            👟 Golden Boot Race
          </div>
          {data.key_battles.golden_boot.map((entry, i) => (
            <div key={entry.player} className="text-sm py-1 border-b border-gray-800 last:border-0">
              <span className="text-gray-400">{i + 1}. </span>
              <span className="text-white">{entry.player}</span>
              <span className="text-gray-500 text-xs"> {entry.team}</span>
              <span className="text-yellow-400 float-right">{entry.goals} goals</span>
            </div>
          ))}
        </div>

        {/* Relegation */}
        <div className="bg-gray-900 rounded-xl p-5 border border-red-900">
          <div className="text-xs text-red-400 uppercase tracking-widest mb-3">
            💀 Relegation Zone
          </div>
          {data.key_battles.relegation.map((entry) => (
            <div key={entry.team} className="text-sm py-1 border-b border-gray-800 last:border-0">
              <span className="text-red-400 font-semibold">{entry.team}</span>
              <span className="text-gray-400 float-right">
                {entry.points}pts · pos {entry.position}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* All 10 Fixtures */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold mb-4">All 10 Fixtures</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.fixtures.map((f) => (
            <div
              key={`${f.home}-${f.away}`}
              className="bg-gray-900 rounded-xl p-5 border border-gray-800"
            >
              {/* Match header */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-center flex-1">
                  <div className="font-bold text-white">{f.home}</div>
                  <div className="text-xs text-gray-500">#{f.home_position} · {f.home_points}pts</div>
                </div>
                <div className="text-gray-600 font-bold px-4">vs</div>
                <div className="text-center flex-1">
                  <div className="font-bold text-white">{f.away}</div>
                  <div className="text-xs text-gray-500">#{f.away_position} · {f.away_points}pts</div>
                </div>
              </div>

              {/* Stakes */}
              <div className="space-y-1">
                {f.stakes.map((stake, i) => (
                  <div key={i} className={`text-xs ${stakeColor(stake)}`}>
                    › {stake}
                  </div>
                ))}
              </div>

              {/* Golden Boot watch */}
              {f.golden_boot_watch.length > 0 && (
                <div className="mt-2 text-xs text-yellow-500">
                  👟 Boot watch: {f.golden_boot_watch.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
