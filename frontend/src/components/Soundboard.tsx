"use client";

import { useState, useRef, useCallback } from "react";

const EL_VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID ?? "";
const EL_API_KEY  = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY  ?? "";

// ─── PHRASES ─────────────────────────────────────────────────────────────────
// Edit these freely — text is what gets spoken, label is what's on the button.

const PHRASES = [
  // Euphoria
  { label: "Easy",              text: "Easy. Easy. Easy.",                    emoji: "😎", tier: "hype"    },
  { label: "Send it",           text: "Send it.",                             emoji: "🚀", tier: "hype"    },
  { label: "Do the thing",      text: "Do the thing.",                        emoji: "⚡", tier: "hype"    },
  { label: "Szoboszlai",        text: "Shaw bah shly.",                       emoji: "🇭🇺", tier: "hype"    },

  // Pain
  { label: "Pure pain",         text: "Pure pain.",                           emoji: "💀", tier: "pain"    },
  { label: "Absolutely gutted", text: "I am absolutely gutted. Gutted.",      emoji: "💔", tier: "pain"    },
  { label: "No no NO",          text: "No. No. NO!",                          emoji: "🙈", tier: "pain"    },

  // Pub classics
  { label: "Blow the whistle",  text: "Blow the whistle. Blow the whistle.",  emoji: "🎵", tier: "classic" },
  { label: "Guinness",          text: "Guinness.",                            emoji: "🖤", tier: "classic" },
  { label: "Carlsberg",         text: "Carlsberg.",                           emoji: "🟡", tier: "classic" },
  { label: "Budweiser",         text: "Budweiser.",                           emoji: "🔴", tier: "classic" },
  { label: "Full round",        text: "Guinness, Carlsberg, and a Budweiser.", emoji: "🍺", tier: "classic" },
  { label: "Kop of Coffee",     text: "Kop of Coffee. Subscribe.",            emoji: "☕", tier: "classic" },
  { label: "Brooklyn OLSC",     text: "Brooklyn Official Liverpool Supporters Club. Let's go!", emoji: "🔴", tier: "classic" },
];

const TIER_COLORS: Record<string, { bg: string; border: string; text: string; active: string }> = {
  hype:    { bg: "#0a2a0a", border: "#166534", text: "#4ade80", active: "#16a34a" },
  pain:    { bg: "#2a0a0a", border: "#991b1b", text: "#f87171", active: "#dc2626" },
  ref:     { bg: "#2a1a00", border: "#92400e", text: "#fb923c", active: "#ea580c" },
  classic: { bg: "#0a0a2a", border: "#1e3a8a", text: "#60a5fa", active: "#2563eb" },
};

// ─── AUDIO HELPERS ───────────────────────────────────────────────────────────

async function speakElevenLabs(text: string): Promise<void> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE_ID}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": EL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.35, similarity_boost: 0.9, style: 0.6, use_speaker_boost: true },
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    audio.play();
  });
}

function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.1;
    utt.pitch = 1.0;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function Soundboard() {
  const [playing, setPlaying] = useState<string | null>(null);
  const queueRef = useRef<string | null>(null);

  const play = useCallback(async (phrase: typeof PHRASES[0]) => {
    if (playing) {
      queueRef.current = phrase.label;
      return;
    }
    setPlaying(phrase.label);
    try {
      if (EL_VOICE_ID && EL_API_KEY) {
        await speakElevenLabs(phrase.text);
      } else {
        await speakBrowser(phrase.text);
      }
    } catch {
      await speakBrowser(phrase.text);
    }
    setPlaying(null);
    if (queueRef.current) {
      const next = PHRASES.find((p) => p.label === queueRef.current);
      queueRef.current = null;
      if (next) play(next);
    }
  }, [playing]);

  const tiers = ["hype", "pain", "classic"] as const;
  const tierLabels: Record<string, string> = {
    hype:    "💚 Pure Hype",
    pain:    "💔 Pure Pain",
    classic: "🎵 Pub Classics",
  };

  return (
    <div className="space-y-6">
      {tiers.map((tier) => {
        const c = TIER_COLORS[tier];
        const phrases = PHRASES.filter((p) => p.tier === tier);
        return (
          <div key={tier}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: c.text }}>
              {tierLabels[tier]}
            </div>
            <div className="flex flex-wrap gap-2">
              {phrases.map((p) => {
                const isPlaying = playing === p.label;
                return (
                  <button
                    key={p.label}
                    onClick={() => play(p)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-100 select-none"
                    style={{
                      backgroundColor: isPlaying ? c.active : c.bg,
                      border: `1px solid ${isPlaying ? c.text : c.border}`,
                      color: isPlaying ? "#fff" : c.text,
                      transform: isPlaying ? "scale(0.96)" : "scale(1)",
                      boxShadow: isPlaying ? `0 0 12px ${c.active}66` : "none",
                    }}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.label}</span>
                    {isPlaying && (
                      <span className="flex gap-0.5 ml-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-0.5 rounded-full bg-current animate-bounce"
                            style={{ height: "10px", animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-gray-600 pt-1">
        {EL_VOICE_ID && EL_API_KEY
          ? "🎙 Speaking in Colby's voice via ElevenLabs"
          : "🔊 Browser TTS — add ElevenLabs keys to .env.local for Colby's voice"}
      </div>
    </div>
  );
}
