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
  fixtures: FixturePreview[];
  key_battles: {
    champions_league: string[];
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

  useEffect(() => {
    fetch(`${API_BASE}/preview`)
      .then((r) => r.json())
      .then(setData);
  }, []);

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
      </header>

      {/* Key Battles */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {/* CL race */}
        <div className="bg-gray-900 rounded-xl p-5 border border-blue-900">
          <div className="text-xs text-blue-400 uppercase tracking-widest mb-3">
            🏆 Champions League Contenders
          </div>
          {data.key_battles.champions_league.map((team) => (
            <div key={team} className="text-sm text-white py-1 border-b border-gray-800 last:border-0">
              {team}
            </div>
          ))}
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
