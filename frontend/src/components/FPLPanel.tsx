"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Brooklyn OLSC confirmed members by FPL entry_id
// Colby (7419755) is highest-ranked member — gets crown treatment
const BROOKLYN_MEMBERS: Record<number, { name: string; isColby?: boolean }> = {
  7419755: { name: "Colby Black", isColby: true },
  516789:  { name: "Sam Clark" },
  205646:  { name: "Bill Palka" },
  202206:  { name: "Benjamin Hicks" },
  6933161: { name: "Cillian Sheehan" },
  5852114: { name: "Marisol Gallo" },
  779827:  { name: "George Lolashvili" },
  8089459: { name: "Prateek Dwivedi" },
  4090828: { name: "Catalina Caro" },
  673835:  { name: "Al Nieliwocki" },
  2715912: { name: "Brett Portnoy" },
  5786521: { name: "Terje Vist" },
  9014532: { name: "Daniel Montoya" },
  7297423: { name: "Aarif Attarwala" },
  3711462: { name: "Adam McDaid" },
};

interface ActivePlayer {
  name: string;
  points: number;
  goals: number;
  assists: number;
}

interface FPLManager {
  rank: number;
  manager: string;
  team_name: string;
  entry_id: number;
  gw_points: number;
  total: number;
  captain: string;
  captain_points: number;
  active_players: ActivePlayer[];
}

interface GoalImpact {
  player: string;
  fpl_team: string;
  owned_by_count: number;
  owners: {
    manager: string;
    team: string;
    is_captain: boolean;
    multiplier: number;
    live_rank: number;
  }[];
  narrative: string;
  standings: FPLManager[];
}

type FPLMessage =
  | { type: "standings"; standings: FPLManager[] }
  | ({ type: "goal_impact" } & GoalImpact);

export default function FPLPanel() {
  const [standings, setStandings] = useState<FPLManager[]>([]);
  const [latestImpact, setLatestImpact] = useState<GoalImpact | null>(null);
  const [expandedManager, setExpandedManager] = useState<string | null>(null);
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws/fpl");

    ws.onmessage = (e) => {
      const msg: FPLMessage = JSON.parse(e.data);

      if (msg.type === "standings") {
        updateStandings(msg.standings);
      } else if (msg.type === "goal_impact") {
        setLatestImpact(msg);
        updateStandings(msg.standings);
        // Clear impact card after 30s
        setTimeout(() => setLatestImpact(null), 30000);
      }
    };

    ws.onerror = () => {
      fetch(`${API_BASE}/fpl/standings`)
        .then((r) => r.json())
        .then(updateStandings);
    };

    return () => ws.close();
  }, []);

  const updateStandings = (newStandings: FPLManager[]) => {
    setPrevRanks((prev) => {
      const updated: Record<string, number> = {};
      newStandings.forEach((m) => {
        updated[m.manager] = prev[m.manager] ?? m.rank;
      });
      return updated;
    });
    setStandings(newStandings);
  };

  const rankDelta = (manager: string, currentRank: number): number => {
    const prev = prevRanks[manager];
    return prev !== undefined ? prev - currentRank : 0;
  };

  if (standings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Loading Brooklyn OLSC fantasy league...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Goal impact flash */}
      {latestImpact && (
        <div className="mx-2 mb-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 flex-shrink-0">
          <div className="text-[10px] text-yellow-500 uppercase tracking-widest mb-1">
            ⚽ FPL Impact
          </div>
          <div className="text-xs text-yellow-200 leading-snug mb-2">
            {latestImpact.narrative}
          </div>
          {latestImpact.owners.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {latestImpact.owners.map((o) => (
                <span
                  key={o.manager}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    o.is_captain
                      ? "bg-yellow-600 text-black font-bold"
                      : "bg-gray-700 text-gray-200"
                  }`}
                >
                  {o.manager.split(" ")[0]}
                  {o.is_captain ? " ©" : ""}
                  {o.multiplier > 1 ? ` ×${o.multiplier}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="text-[9px] text-gray-600 uppercase tracking-widest">
          Brooklyn OLSC · GW38 Live
        </div>
      </div>

      {/* Standings list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {standings.map((m) => {
          const delta = rankDelta(m.manager, m.rank);
          const isExpanded = expandedManager === m.manager;
          const member = BROOKLYN_MEMBERS[m.entry_id];

          return (
            <div
              key={m.manager}
              className={`rounded-lg border transition-all duration-200 cursor-pointer ${
                member?.isColby
                  ? isExpanded
                    ? "border-red-600 bg-red-950/30"
                    : "border-red-800/60 bg-red-950/20 hover:bg-red-950/30"
                  : isExpanded
                  ? "border-gray-600 bg-gray-800"
                  : "border-gray-800 bg-gray-900/50 hover:bg-gray-800/60"
              }`}
              onClick={() =>
                setExpandedManager(isExpanded ? null : m.manager)
              }
            >
              {/* Main row */}
              <div className="flex items-center gap-2 px-3 py-2">

                {/* Rank */}
                <div className="w-5 text-center flex-shrink-0">
                  <span
                    className={`text-sm font-black ${
                      m.rank === 1
                        ? "text-yellow-400"
                        : m.rank <= 3
                        ? "text-gray-300"
                        : "text-gray-600"
                    }`}
                  >
                    {m.rank}
                  </span>
                </div>

                {/* Rank delta */}
                <div className="w-4 text-center flex-shrink-0">
                  {delta > 0 ? (
                    <span className="text-[10px] text-green-500">▲{delta}</span>
                  ) : delta < 0 ? (
                    <span className="text-[10px] text-red-500">▼{Math.abs(delta)}</span>
                  ) : (
                    <span className="text-[10px] text-gray-700">–</span>
                  )}
                </div>

                {/* Manager info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-white truncate">
                      {m.team_name}
                    </span>
                    {member?.isColby && (
                      <span className="text-[10px] flex-shrink-0" title="Colby — highest-ranked Brooklyn member">👑</span>
                    )}
                    {member && !member.isColby && (
                      <span className="text-[10px] flex-shrink-0" title={`${member.name} — Brooklyn OLSC`}>🔴</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {m.manager}
                  </div>
                </div>

                {/* GW points */}
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-white">
                    {m.gw_points}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {m.total} tot
                  </div>
                </div>
              </div>

              {/* Expanded: captain + top scorers */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-700/50 mt-1 pt-2">
                  {/* Captain */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] text-yellow-500 uppercase tracking-wide">
                      Captain
                    </span>
                    <span className="text-xs text-white">{m.captain}</span>
                    <span className="text-[10px] text-yellow-400 ml-auto">
                      {m.captain_points}pts
                    </span>
                  </div>

                  {/* Top contributing players */}
                  <div className="space-y-0.5">
                    {[...m.active_players]
                      .sort((a, b) => b.points - a.points)
                      .slice(0, 5)
                      .map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center justify-between text-[10px]"
                        >
                          <span className="text-gray-400 truncate flex-1">{p.name}</span>
                          <span className="flex gap-2 text-gray-500 ml-2">
                            {p.goals > 0 && (
                              <span className="text-green-400">⚽{p.goals}</span>
                            )}
                            {p.assists > 0 && (
                              <span className="text-blue-400">🅰{p.assists}</span>
                            )}
                            <span className="text-white font-medium w-6 text-right">
                              {p.points}
                            </span>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
