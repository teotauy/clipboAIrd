"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

interface ChaosGoal {
  scorer: string;
  team: string;
  opponent: string;
  minute: number;
  score_at_time: string;
  havoc_score: number;
  narrative: string;
  breakdown?: Record<string, number>;
}

interface ChaosData {
  most_chaotic_goal: ChaosGoal | null;
  top_10: ChaosGoal[];
}

const BREAKDOWN_LABELS: Record<string, string> = {
  top4_boundary: "Top 4 boundary crossed",
  relegation_boundary: "Relegation line crossed",
  europa_boundary: "Europa League spot shifted",
  conference_boundary: "Conference League place moved",
  golden_boot_change: "Golden Boot leader changed",
  position_swings: "Position cascade",
};

export default function ChaosPage() {
  const [data, setData] = useState<ChaosData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/chaos`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <div className="text-xl font-bold text-gray-400">Replaying the entire season...</div>
        <div className="text-gray-600 text-sm">Scoring every goal for havoc. This takes a moment.</div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-red-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500">No chaos data available.</div>
      </main>
    );
  }

  const winner = data.most_chaotic_goal;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <header className="text-center mb-10">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Season Review</div>
        <h1 className="text-4xl font-bold text-red-500">THE CHAOS CROWN</h1>
        <p className="text-gray-400 mt-2 text-sm">
          Every goal from every match this season — scored for simultaneous havoc
        </p>
      </header>

      {/* Winner */}
      {winner && (
        <div className="max-w-2xl mx-auto mb-12">
          <div className="bg-gradient-to-br from-yellow-900/40 to-red-900/40 border border-yellow-600 rounded-2xl p-8 text-center">
            <div className="text-yellow-400 text-xs uppercase tracking-widest mb-3">
              🔥 Most Chaotic Goal of the Season
            </div>
            <div className="text-4xl font-black text-white mb-1">
              {winner.scorer}
            </div>
            <div className="text-gray-400 text-sm mb-4">
              {winner.team} vs {winner.opponent} · {winner.minute}' · {winner.score_at_time}
            </div>
            <div className="text-yellow-300 text-5xl font-black mb-4">
              {winner.havoc_score.toFixed(1)}
              <span className="text-xl text-yellow-600 ml-2">havoc pts</span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed max-w-xl mx-auto">
              {winner.narrative}
            </p>

            {/* Breakdown */}
            {winner.breakdown && (
              <div className="mt-6 grid grid-cols-2 gap-2 text-left max-w-md mx-auto">
                {Object.entries(winner.breakdown).map(([key, val]) => (
                  <div key={key} className="bg-black/30 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{BREAKDOWN_LABELS[key] || key}</div>
                    <div className="text-yellow-400 font-bold">+{(val as number).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top 10 */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold mb-4">Top 10 Most Chaotic Goals</h2>
        <div className="space-y-3">
          {data.top_10.map((goal, i) => (
            <div
              key={`${goal.scorer}-${goal.minute}-${i}`}
              className={`bg-gray-900 rounded-xl p-4 border flex gap-4 ${
                i === 0 ? "border-yellow-600" : "border-gray-800"
              }`}
            >
              <div className="text-3xl font-black text-gray-700 w-10 text-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-bold text-white truncate">{goal.scorer}</div>
                  <div className="text-yellow-400 font-bold text-sm flex-shrink-0">
                    {goal.havoc_score.toFixed(1)} pts
                  </div>
                </div>
                <div className="text-xs text-gray-500 mb-1">
                  {goal.team} vs {goal.opponent} · {goal.minute}' · {goal.score_at_time}
                </div>
                <div className="text-xs text-gray-400 leading-snug">{goal.narrative}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
