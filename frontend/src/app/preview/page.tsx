"use client";

import { useEffect, useState } from "react";
import Soundboard from "@/components/Soundboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// ─── TYPES ────────────────────────────────────────────────────────────────────

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
    permutation_stats: {
      total: number;
      simultaneous_kickoffs: number;
      kickoff_bst: string;
      tagline: string;
    };
    history_on_the_line: {
      team: string;
      headline: string;
      body: string;
      icon: string;
      color: string;
    }[];
    european_pedigree: {
      team: string;
      cl_seasons: number;
      cl_titles: number;
      el_titles: number;
      best_cl: string;
      note: string;
    }[];
    fixture_lore: Record<string, { note: string; series: string }>;
    golden_gloves: { keeper: string; team: string; clean_sheets: number }[];
    wild_facts: { stat: string; label: string; detail: string; icon: string }[];
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

// ─── SECTION WRAPPER ─────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 border-t border-gray-800/60">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

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
        <div className="text-red-400 text-sm font-mono">Error: {error}<br />API: {API_BASE}</div>
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

  const facts = data.facts;
  const lore = facts?.fixture_lore ?? {};

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div
        className="relative text-center px-6 pt-16 pb-12 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0c0a0a 0%, #070b18 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(ellipse at 50% 0%, #dc2626 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="text-xs text-gray-500 uppercase tracking-[0.3em] mb-3">Matchweek 38 · Final Day</div>
          <h1 className="text-5xl md:text-7xl font-black text-white leading-none tracking-tighter mb-6">
            THE DAY<br />
            <span className="text-red-500">AHEAD</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">
            {data.day_summary}
          </p>
          {data.standings_incomplete && (
            <div className="mt-5 inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs px-4 py-2 rounded-lg">
              ⚠ Standings not final — some clubs haven&apos;t completed MW37.
            </div>
          )}
          {data.playoff_note && (
            <div className="mt-4 inline-block bg-purple-900/30 border border-purple-700 text-purple-300 text-xs px-4 py-2 rounded-lg max-w-xl">
              {data.playoff_note}
            </div>
          )}
        </div>
      </div>

      {/* ── SOUNDBOARD ───────────────────────────────────────────────────── */}
      <Section title="Colby's Soundboard" subtitle="The things you always say. Now one click away.">
        <Soundboard />
      </Section>

      {/* ── WILD FACTS / NUMBERS BAR ─────────────────────────────────────── */}
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

      {/* ── THE STAKES ───────────────────────────────────────────────────── */}
      <Section title="The Stakes" subtitle="Everything that can still change today">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Europe race */}
          <div className="bg-gray-900 rounded-xl p-5 border border-blue-900/50">
            <div className="text-xs text-blue-400 uppercase tracking-widest mb-3">🌍 European Places</div>
            {data.key_battles.europe.map((entry) => {
              const pos = entry.position;
              const zone =
                pos === 1 ? { label: "PL", color: "#d4a500" }
                : pos <= 5 ? { label: "CL", color: "#2563eb" }
                : pos === 6 ? { label: "CL?", color: "#7c3aed" }
                : pos <= 8 ? { label: "EL", color: "#ea6c1a" }
                : { label: "UECL", color: "#16a34a" };
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
                    {entry.locked && <span className="text-[9px] font-bold" style={{ color: zone.color }}>✓</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!entry.locked && spread && (
                      <span className="text-[10px] text-gray-600">{spread}</span>
                    )}
                    <span className="text-gray-500 text-xs">{entry.points}pts</span>
                  </div>
                </div>
              );
            })}
            <div className="mt-3 text-[10px] text-purple-400 leading-snug">
              ⚠ CL? = Champions League only if Aston Villa finish 5th
            </div>
          </div>

          {/* Golden Boot */}
          <div className="bg-gray-900 rounded-xl p-5 border border-yellow-900/50">
            <div className="text-xs text-yellow-400 uppercase tracking-widest mb-3">👟 Golden Boot</div>
            {data.key_battles.golden_boot.map((entry, i) => (
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

          {/* Relegation */}
          <div className="bg-gray-900 rounded-xl p-5 border border-red-900/50">
            <div className="text-xs text-red-400 uppercase tracking-widest mb-3">💀 Survival Zone</div>
            {data.key_battles.relegation.map((entry) => (
              <div key={entry.team} className="text-sm py-1.5 border-b border-gray-800 last:border-0 flex items-center justify-between">
                <span className={entry.position >= 18 ? "text-red-400 font-semibold" : "text-gray-300"}>
                  {entry.team}
                </span>
                <span className="text-gray-400 text-xs">
                  {entry.points}pts · #{entry.position}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── GOLDEN GLOVES ────────────────────────────────────────────────── */}
      {facts?.golden_gloves && (
        <Section title="Golden Gloves Race" subtitle="Clean sheet leaders heading into the final day">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {facts.golden_gloves.map((g, i) => (
              <div
                key={g.keeper}
                className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800"
                style={i === 0 ? { borderColor: "#ca8a04" } : {}}
              >
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

      {/* ── ALL 10 FIXTURES ──────────────────────────────────────────────── */}
      <Section title="All 10 Fixtures" subtitle="Simultaneous kick-off at 16:00 BST">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.fixtures.map((f) => {
            const loreKey = `${f.home} vs ${f.away}`;
            const fl = lore[loreKey];
            return (
              <div
                key={loreKey}
                className="bg-gray-900 rounded-xl p-5 border border-gray-800"
              >
                {/* Match header */}
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

                {/* Stakes */}
                <div className="space-y-0.5 mb-2">
                  {f.stakes.map((stake, i) => (
                    <div key={i} className={`text-xs ${stakeColor(stake)}`}>
                      › {stake}
                    </div>
                  ))}
                </div>

                {/* Golden Boot watch */}
                {f.golden_boot_watch.length > 0 && (
                  <div className="text-xs text-yellow-500 mb-2">
                    👟 {f.golden_boot_watch.join(", ")}
                  </div>
                )}

                {/* Historical lore */}
                {fl && (
                  <div className="mt-3 pt-3 border-t border-gray-800/60">
                    <div className="text-[11px] text-gray-400 italic leading-snug">{fl.note}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{fl.series}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── HISTORY ON THE LINE ──────────────────────────────────────────── */}
      {facts?.history_on_the_line && facts.history_on_the_line.length > 0 && (
        <Section title="History on the Line" subtitle="Records that could be written or broken today">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {facts.history_on_the_line.map((item) => (
              <div
                key={item.team}
                className="bg-gray-900 rounded-xl p-5 border border-gray-800"
                style={{ borderLeftColor: item.color, borderLeftWidth: "3px" }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{item.icon}</span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: item.color }}>
                      {item.team}
                    </div>
                    <div className="text-white font-bold text-sm leading-snug mb-2">{item.headline}</div>
                    <div className="text-gray-400 text-xs leading-relaxed">{item.body}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── EUROPEAN PEDIGREE ────────────────────────────────────────────── */}
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

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-10 border-t border-gray-800/60 text-center">
        <div className="text-gray-600 text-xs leading-relaxed">
          All 10 matches kick off simultaneously at 16:00 BST.<br />
          Head to the <span className="text-red-400">Spread Table</span> once the whistle blows.
        </div>
      </div>

    </main>
  );
}
