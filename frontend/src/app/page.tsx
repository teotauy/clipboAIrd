"use client";

import { useEffect, useState, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark" });

interface EngineState {
  live_table: { team: string; points: number; gd: number; gf: number }[];
  top_4_race: {
    top_4: { team: string; points: number; gd: number }[];
    liverpool_position: number;
    liverpool_in_cl: boolean;
    gap_to_fourth: number;
  };
  golden_boot: { player: string; team: string; goals: number }[];
  relegation: { team: string; points: number; gd: number }[];
  anfield_sentiment: number;
  butterfly_effects: { trigger: string; cascades: { narrative: string }[] }[];
}

interface Flowcharts {
  top_4: string;
  golden_boot: string;
  relegation: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function Home() {
  const [state, setState] = useState<EngineState | null>(null);
  const [flowcharts, setFlowcharts] = useState<Flowcharts | null>(null);
  const [activeTab, setActiveTab] = useState<"top4" | "boot" | "relegation">("top4");
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws");
    ws.onmessage = (e) => setState(JSON.parse(e.data));
    ws.onerror = () => {
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/state`);
          setState(await res.json());
        } catch {}
      }, 15000);
      return () => clearInterval(poll);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const fetchCharts = async () => {
      try {
        const res = await fetch(`${API_BASE}/flowcharts`);
        setFlowcharts(await res.json());
      } catch {}
    };
    fetchCharts();
    const interval = setInterval(fetchCharts, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!flowcharts || !chartRef.current) return;
    const chart =
      activeTab === "top4"
        ? flowcharts.top_4
        : activeTab === "boot"
        ? flowcharts.golden_boot
        : flowcharts.relegation;

    chartRef.current.innerHTML = "";
    mermaid.render("mermaid-chart", chart).then(({ svg }) => {
      if (chartRef.current) chartRef.current.innerHTML = svg;
    });
  }, [flowcharts, activeTab]);

  const sentimentColor = (s: number) =>
    s > 0.5 ? "#00b894" : s > 0 ? "#fdcb6e" : s > -0.5 ? "#e17055" : "#d63031";

  const sentimentLabel = (s: number) =>
    s > 0.5 ? "EUPHORIA" : s > 0 ? "CAUTIOUS HOPE" : s > -0.5 ? "NERVOUS" : "DREAD";

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-red-500">THE ANFIELD ORACLE</h1>
        <p className="text-gray-400 mt-2">Matchweek 38 Omniscient Simulator</p>
      </header>

      {state && (
        <div className="max-w-2xl mx-auto mb-8 text-center">
          <div className="text-sm text-gray-400 mb-1">ANFIELD SENTIMENT VELOCITY</div>
          <div
            className="text-2xl font-bold"
            style={{ color: sentimentColor(state.anfield_sentiment) }}
          >
            {sentimentLabel(state.anfield_sentiment)}
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((state.anfield_sentiment + 1) / 2) * 100}%`,
                backgroundColor: sentimentColor(state.anfield_sentiment),
              }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-center gap-4 mb-6">
        {(["top4", "boot", "relegation"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded font-semibold transition ${
              activeTab === tab
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {tab === "top4" ? "Top 4 Race" : tab === "boot" ? "Golden Boot" : "Relegation"}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto bg-gray-900 rounded-xl p-6 mb-8">
        <div ref={chartRef} className="overflow-x-auto" />
      </div>

      {state && (
        <div className="max-w-3xl mx-auto bg-gray-900 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Live Table</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">#</th>
                <th className="text-left">Team</th>
                <th className="text-right">Pts</th>
                <th className="text-right">GD</th>
              </tr>
            </thead>
            <tbody>
              {state.live_table.map((team, i) => (
                <tr
                  key={team.team}
                  className={`border-b border-gray-800 ${
                    team.team === "Liverpool" ? "bg-red-900/20" : ""
                  } ${i < 4 ? "text-green-400" : i >= state.live_table.length - 3 ? "text-red-400" : ""}`}
                >
                  <td className="py-2">{i + 1}</td>
                  <td>{team.team}</td>
                  <td className="text-right">{team.points}</td>
                  <td className="text-right">{team.gd > 0 ? "+" : ""}{team.gd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state && state.butterfly_effects.length > 0 && (
        <div className="max-w-3xl mx-auto bg-gray-900 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Butterfly Effects</h2>
          {state.butterfly_effects.map((effect, i) => (
            <div key={i} className="mb-4 border-l-2 border-yellow-500 pl-4">
              <div className="font-semibold text-yellow-400">{effect.trigger}</div>
              {effect.cascades.map((c, j) => (
                <div key={j} className="text-sm text-gray-300 mt-1">
                  {c.narrative}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
