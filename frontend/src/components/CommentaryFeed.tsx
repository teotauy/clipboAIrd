"use client";

import { useEffect, useRef } from "react";

export interface CommentaryEntry {
  id: string;
  timestamp: string;    // "45'+2" or "HT" or "67'"
  matchLabel: string;   // "LFC vs Villa"
  eventType: "goal" | "card" | "shot" | "ht" | "ft" | "stoppage" | "poll";
  text: string;
  isActive: boolean;    // currently being spoken
}

const EVENT_COLORS: Record<CommentaryEntry["eventType"], string> = {
  goal:     "border-green-500 bg-green-900/20",
  card:     "border-yellow-400 bg-yellow-900/20",
  shot:     "border-blue-400 bg-blue-900/20",
  ht:       "border-orange-400 bg-orange-900/20",
  ft:       "border-red-500 bg-red-900/20",
  stoppage: "border-purple-400 bg-purple-900/20",
  poll:     "border-gray-600 bg-gray-900/10",
};

const EVENT_ICONS: Record<CommentaryEntry["eventType"], string> = {
  goal:     "⚽",
  card:     "🟨",
  shot:     "🧤",
  ht:       "🔔",
  ft:       "🏁",
  stoppage: "⏱️",
  poll:     "📡",
};

export default function CommentaryFeed({ entries }: { entries: CommentaryEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="h-[420px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-700">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex gap-3 p-3 rounded-lg border-l-4 transition-all duration-300 ${
            EVENT_COLORS[entry.eventType]
          } ${entry.isActive ? "scale-[1.02] shadow-lg" : "opacity-80"}`}
        >
          {/* Timestamp column */}
          <div className="flex-shrink-0 text-center w-14">
            <div className="text-xs font-mono text-gray-400">{entry.timestamp}</div>
            <div className="text-lg leading-none">{EVENT_ICONS[entry.eventType]}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 truncate">{entry.matchLabel}</div>
          </div>

          {/* Commentary text */}
          <div
            className={`text-sm leading-snug ${
              entry.isActive ? "text-white font-medium" : "text-gray-300"
            }`}
          >
            {entry.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
