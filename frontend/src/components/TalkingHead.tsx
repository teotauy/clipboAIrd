"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type VoiceTier = "premium" | "browser";

interface TalkingHeadProps {
  faceImageUrl: string;
  text: string;
  isSpeaking: boolean;
  voiceTier: VoiceTier;
  onSpeakEnd: () => void;
  voiceRate?: number;
  voicePitch?: number;
  size?: "sm" | "md";  // sm = floating widget, md = full page (default)
}

const ELEVENLABS_VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "";

async function speakElevenLabs(text: string): Promise<HTMLAudioElement | null> {
  if (!ELEVENLABS_VOICE_ID || !ELEVENLABS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: { stability: 0.45, similarity_boost: 0.85 },
        }),
      }
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Audio(URL.createObjectURL(blob));
  } catch {
    return null;
  }
}

export default function TalkingHead({
  faceImageUrl,
  text,
  isSpeaking,
  voiceTier,
  onSpeakEnd,
  voiceRate = 1.05,
  voicePitch = 1.0,
  size = "md",
}: TalkingHeadProps) {
  const dim = size === "sm" ? "w-16 h-16" : "w-64 h-64";
  const mouthScale = size === "sm" ? 0.5 : 1;
  const [mouthOpen, setMouthOpen] = useState(false);
  const mouthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startMouthFlap = useCallback(() => {
    mouthIntervalRef.current = setInterval(
      () => setMouthOpen((p) => !p),
      120
    );
  }, []);

  const stopMouthFlap = useCallback(() => {
    if (mouthIntervalRef.current) clearInterval(mouthIntervalRef.current);
    setMouthOpen(false);
  }, []);

  useEffect(() => {
    if (!isSpeaking || !text) return;

    let cancelled = false;

    const run = async () => {
      // Premium path: ElevenLabs (goals, HT, FT only)
      if (voiceTier === "premium") {
        const audio = await speakElevenLabs(text);
        if (audio && !cancelled) {
          audioRef.current = audio;
          audio.onplay = startMouthFlap;
          audio.onended = () => {
            if (!cancelled) { stopMouthFlap(); onSpeakEnd(); }
          };
          audio.onerror = () => {
            if (!cancelled) { stopMouthFlap(); onSpeakEnd(); }
          };
          audio.play();
          return;
        }
        // Fall through to browser TTS if ElevenLabs fails/unconfigured
      }

      // Browser path: Web Speech API (cards, shots, stoppage, poll)
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = voiceRate;
      utterance.pitch = voicePitch;

      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.lang === "en-GB" && v.name.toLowerCase().includes("male")) ||
        voices.find((v) => v.lang === "en-GB") ||
        voices[0];
      if (preferred) utterance.voice = preferred;

      utterance.onstart = startMouthFlap;
      utterance.onend = () => {
        if (!cancelled) { stopMouthFlap(); onSpeakEnd(); }
      };
      utterance.onerror = () => {
        if (!cancelled) { stopMouthFlap(); onSpeakEnd(); }
      };

      window.speechSynthesis.speak(utterance);
    };

    run();

    return () => {
      cancelled = true;
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      stopMouthFlap();
    };
  }, [isSpeaking, text, voiceTier]);

  return (
    <div className={`relative ${dim} mx-auto select-none`}>
      <img
        src={faceImageUrl}
        alt="Colby"
        className="w-full h-full object-cover rounded-full border-4 border-red-600 shadow-2xl"
        draggable={false}
      />

      {/* Mouth — adjust `top` % to match your face photo */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[#1a0a00]"
        style={{
          top: "68%",
          width: mouthOpen ? `${36 * mouthScale}px` : `${32 * mouthScale}px`,
          height: mouthOpen ? `${22 * mouthScale}px` : `${6 * mouthScale}px`,
          borderRadius: mouthOpen ? "50%" : "4px",
          transition: "height 0.06s ease, width 0.06s ease",
          boxShadow: mouthOpen ? "inset 0 3px 6px rgba(255,255,255,0.15)" : "none",
          border: mouthOpen ? `${mouthScale * 2}px solid #8B4513` : "none",
        }}
      />

      {/* Voice tier badge */}
      {isSpeaking && (
        <div className="absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60">
          {voiceTier === "premium" ? "🎙 EL" : "🔊 BR"}
        </div>
      )}

      {isSpeaking && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
