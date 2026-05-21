"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

interface RecapData {
  finished: boolean;
  champions: string;
  final_table: {
    position: number;
    team: string;
    points: number;
    gd: number;
    gf: number;
    label: string;
    relegated: boolean;
  }[];
  mw38_results: {
    home: string;
    away: string;
    home_goals: number;
    away_goals: number;
    result: string;
  }[];
  european_spots: { position: number; team: string; competition: string }[];
  relegated: string[];
  golden_boot_winner: { player: string; team: string; goals: number } | null;
  biggest_result: { home: string; away: string; home_goals: number; away_goals: number } | null;
  liverpool_narrative: string;
  season_narrative: string;
}

function rowBg(pos: number, relegated: boolean): string {
  if (pos === 1) return "bg-yellow-900/30 text-yellow-300";
  if (pos <= 4) return "bg-blue-900/20 text-blue-300";
  if (pos <= 6) return "bg-orange-900/20 text-orange-300";
  if (pos === 7) return "bg-green-900/20 text-green-300";
  if (relegated) return "bg-red-900/30 text-red-300";
  return "text-gray-300";
}

export default function RecapPage() {
  const [data, setData] = useState<RecapData | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    const fetchRecap = async () => {
      try {
        const res = await fetch(`${API_BASE}/recap`);
        const json = await res.json();
        setData(json);
        if (json.finished) setPolling(false);
      } catch {}
    };

    fetchRecap();
    const interval = setInterval(fetchRecap, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 animate-pulse">Waiting for full time...</div>
      </main>
    );
  }

  if (!data.finished) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="text-xs text-gray-600 uppercase tracking-widest">After the final whistle</div>
          <h1 className="text-3xl font-black text-red-500">FINAL RECKONING</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            When all 10 matches hit full time on Sunday, this page auto-generates
            the complete season story — final table, confirmed European spots,
            relegated clubs, Golden Boot winner, biggest result of the day,
            and a Liverpool narrative for the ages.
          </p>
          <p className="text-gray-600 text-xs leading-relaxed">
            Brooklyn OLSC fantasy league results land here too — GW38 winner,
            season champion, and the full standings.
          </p>
          <div className="pt-2 border-t border-gray-800 text-gray-600 text-xs">
            Come back at full time. It'll be worth it.
          </div>
          <div className="flex gap-1 justify-center pt-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-red-800 animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <header className="text-center mb-10">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Season Complete</div>
        <h1 className="text-4xl font-bold text-red-500">FINAL RECKONING</h1>
        {data.champions && (
          <div className="text-yellow-400 text-xl font-bold mt-3">
            🏆 {data.champions} — Premier League Champions
          </div>
        )}
        <p className="text-gray-400 mt-3 max-w-2xl mx-auto text-sm leading-relaxed">
          {data.season_narrative}
        </p>
      </header>

      {/* Liverpool callout */}
      {data.liverpool_narrative && (
        <div className="max-w-2xl mx-auto mb-8 bg-red-950/40 border border-red-800 rounded-xl p-5 text-center">
          <div className="text-xs text-red-400 uppercase tracking-widest mb-2">Liverpool FC</div>
          <div className="text-white text-sm leading-relaxed">{data.liverpool_narrative}</div>
        </div>
      )}

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Final Table */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-4">Final Table</h2>
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
              {data.final_table.map((row) => (
                <tr
                  key={row.team}
                  className={`border-b border-gray-800/50 ${rowBg(row.position, row.relegated)}`}
                >
                  <td className="py-1.5">{row.position}</td>
                  <td className="font-medium">{row.team}</td>
                  <td className="text-right font-bold">{row.points}</td>
                  <td className="text-right text-xs">
                    {row.gd > 0 ? "+" : ""}{row.gd}
                  </td>
                  <td className="pl-3 text-xs hidden md:table-cell opacity-80">{row.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* MW38 Results */}
          <div className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-sm font-bold mb-3 text-gray-400 uppercase tracking-wide">
              Today&apos;s Results
            </h2>
            {data.mw38_results.map((r) => (
              <div
                key={`${r.home}-${r.away}`}
                className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0 text-sm"
              >
                <span className={r.result === "home_win" ? "text-white font-semibold" : "text-gray-500"}>
                  {r.home}
                </span>
                <span className="font-mono text-white px-2">
                  {r.home_goals}–{r.away_goals}
                </span>
                <span className={r.result === "away_win" ? "text-white font-semibold" : "text-gray-500"}>
                  {r.away}
                </span>
              </div>
            ))}
          </div>

          {/* Awards */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-4">
            {data.golden_boot_winner && (
              <div>
                <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">
                  👟 Golden Boot
                </div>
                <div className="text-white font-bold">{data.golden_boot_winner.player}</div>
                <div className="text-gray-500 text-xs">
                  {data.golden_boot_winner.team} · {data.golden_boot_winner.goals} goals
                </div>
              </div>
            )}

            {data.biggest_result && (
              <div>
                <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">
                  💥 Biggest Result Today
                </div>
                <div className="text-white text-sm">
                  {data.biggest_result.home} {data.biggest_result.home_goals}–{data.biggest_result.away_goals} {data.biggest_result.away}
                </div>
              </div>
            )}

            {data.relegated.length > 0 && (
              <div>
                <div className="text-xs text-red-400 uppercase tracking-wide mb-1">
                  💀 Relegated
                </div>
                {data.relegated.map((t) => (
                  <div key={t} className="text-red-300 text-sm">{t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
