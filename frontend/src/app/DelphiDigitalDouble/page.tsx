"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TalkingHead, { VoiceTier } from "@/components/TalkingHead";
import CommentaryFeed, { CommentaryEntry } from "@/components/CommentaryFeed";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Drop your headshot in /public/colby.png — square crop, face centred
const FACE_IMAGE = "/colby.png";

interface DelphiPayload {
  timestamp: string;
  match_minute: number;
  trigger_event: string;
  trigger_detail: string | null;
  state: {
    top_4_race: { liverpool_position: number; liverpool_in_cl: boolean };
    anfield_sentiment: number;
  };
  narrative_summary: string;
}

function formatTimestamp(minute: number, detail: string | null): string {
  if (detail === "HT") return "HT";
  if (detail === "FT") return "FT";
  if (minute === 0) return "Pre";
  return `${minute}'`;
}

function eventType(trigger: string, detail: string | null): CommentaryEntry["eventType"] {
  if (trigger === "goal") return "goal";
  if (trigger === "card") return "card";
  if (trigger === "shot") return "shot";
  if (detail === "HT") return "ht";
  if (detail === "FT") return "ft";
  if (detail === "Stoppage") return "stoppage";
  return "poll";
}

let entryCounter = 0;

export default function DelphiDigitalDouble() {
  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [currentVoiceTier, setCurrentVoiceTier] = useState<VoiceTier>("browser");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [question, setQuestion] = useState("");
  const queueRef = useRef<DelphiPayload[]>([]);
  const processingRef = useRef(false);

  const enqueue = useCallback((payload: DelphiPayload) => {
    queueRef.current.push(payload);
    if (!processingRef.current) processQueue();
  }, []);

  const processQueue = useCallback(() => {
    const payload = queueRef.current.shift();
    if (!payload) {
      processingRef.current = false;
      return;
    }
    processingRef.current = true;

    const id = String(++entryCounter);
    const newEntry: CommentaryEntry = {
      id,
      timestamp: formatTimestamp(payload.match_minute, payload.trigger_detail),
      matchLabel: "MW38",
      eventType: eventType(payload.trigger_event, payload.trigger_detail),
      text: payload.narrative_summary,
      isActive: true,
    };

    // Premium voice for goals, HT, FT — browser for everything else
    const tier: VoiceTier =
      ["goal", "ht", "ft"].includes(eventType(payload.trigger_event, payload.trigger_detail))
        ? "premium"
        : "browser";

    setEntries((prev) =>
      [...prev.map((e) => ({ ...e, isActive: false })), newEntry].slice(-80)
    );
    setCurrentText(payload.narrative_summary);
    setCurrentVoiceTier(tier);
    setIsSpeaking(true);
  }, []);

  const onSpeakEnd = useCallback(() => {
    setIsSpeaking(false);
    setEntries((prev) =>
      prev.map((e) => (e.isActive ? { ...e, isActive: false } : e))
    );
    setTimeout(processQueue, 600);
  }, []);

  // WebSocket connection — receives Delphi payloads from backend
  useEffect(() => {
    const ws = new WebSocket(API_BASE.replace("http", "ws") + "/ws/delphi");
    ws.onmessage = (e) => {
      try {
        const payload: DelphiPayload = JSON.parse(e.data);
        enqueue(payload);
      } catch {}
    };
    ws.onerror = () => {
      // Fallback: poll every 20s
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/delphi-payload`);
          const payload = await res.json();
          enqueue(payload);
        } catch {}
      }, 20000);
      return () => clearInterval(poll);
    };
    return () => ws.close();
  }, [enqueue]);

  const askManually = async () => {
    if (!question.trim()) return;
    const q = question;
    setQuestion("");

    // Inject user question as a manual Delphi payload
    try {
      const stateRes = await fetch(`${API_BASE}/delphi-payload`);
      const base: DelphiPayload = await stateRes.json();
      enqueue({ ...base, narrative_summary: `You asked: "${q}" — ${base.narrative_summary}` });
    } catch {}
  };

  const sentimentLabel = (s: number) =>
    s > 0.5 ? "EUPHORIA" : s > 0 ? "CAUTIOUS HOPE" : s > -0.5 ? "NERVOUS" : "DREAD";

  const latestState = entries.length > 0 ? null : null; // populated from payload context

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="text-center py-6 border-b border-gray-800">
        <h1 className="text-3xl font-bold text-red-500">DELPHI DIGITAL DOUBLE</h1>
        <p className="text-gray-500 text-sm mt-1">
          Live from somewhere in Brooklyn, emotionally compromised
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

        {/* LEFT — Talking Head */}
        <div className="flex flex-col items-center gap-6">
          <TalkingHead
            faceImageUrl={FACE_IMAGE}
            text={currentText}
            isSpeaking={isSpeaking}
            voiceTier={currentVoiceTier}
            onSpeakEnd={onSpeakEnd}
          />

          {/* Current utterance caption */}
          <div className="w-full min-h-[80px] bg-gray-900 rounded-xl px-4 py-3 text-sm text-gray-200 italic border border-gray-800">
            {currentText || (
              <span className="text-gray-600">
                Waiting for events... the match hasn&apos;t started.
              </span>
            )}
          </div>

          {/* Manual question input */}
          <div className="w-full">
            <div className="text-xs text-gray-500 mb-2">Ask Colby directly:</div>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askManually()}
                placeholder="What does that Aston Villa goal mean for us?"
                className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                onClick={askManually}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                Ask
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — Commentary Feed */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Match Commentary</h2>
            <span className="text-xs text-gray-500 font-mono">
              {entries.length} events
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="h-[420px] flex items-center justify-center text-gray-600 text-sm">
              Commentary will appear as events happen across all 10 matches
            </div>
          ) : (
            <CommentaryFeed entries={entries} />
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-gray-500">
            {(["goal", "card", "shot", "ht", "ft", "stoppage"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span>
                  {t === "goal" ? "⚽" : t === "card" ? "🟨" : t === "shot" ? "🧤" : t === "ht" ? "🔔" : t === "ft" ? "🏁" : "⏱️"}
                </span>
                {t.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
