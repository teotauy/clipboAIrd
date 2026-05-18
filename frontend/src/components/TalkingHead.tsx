"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

export type VoiceTier = "premium" | "browser";

interface TalkingHeadProps {
  faceImageUrl?: string; // kept for API compat, unused now
  text: string;
  isSpeaking: boolean;
  voiceTier: VoiceTier;
  onSpeakEnd: () => void;
  voiceRate?: number;
  voicePitch?: number;
  size?: "sm" | "md";
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

// ── 3-D model ────────────────────────────────────────────────────────────────
function ColbyModel({ mouthOpen }: { mouthOpen: boolean }) {
  const { scene } = useGLTF("/colby.glb");
  const groupRef = useRef<THREE.Group>(null);

  // Find tongue + mouth meshes for mouth animation
  const tongueRef = useRef<THREE.Mesh | null>(null);
  const mouthRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.name === "Tongue" || child.name === "TongueGroove") {
          tongueRef.current = child;
        }
        if (child.name === "Mouth") {
          mouthRef.current = child;
        }
      }
    });
  }, [scene]);

  // Gentle idle bob + mouth animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.6) * 0.12;
      groupRef.current.position.y =
        Math.sin(state.clock.elapsedTime * 1.2) * 0.04;
    }
    // Drop tongue down when mouth opens
    if (tongueRef.current) {
      tongueRef.current.position.z = mouthOpen
        ? THREE.MathUtils.lerp(tongueRef.current.position.z, -0.12, 0.3)
        : THREE.MathUtils.lerp(tongueRef.current.position.z, 0, 0.3);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Model is built facing +Y in Blender; rotate so it faces the camera */}
      <primitive
        object={scene}
        scale={1}
        rotation={[0, Math.PI, 0]}
      />
    </group>
  );
}

useGLTF.preload("/colby.glb");

// ── Main component ────────────────────────────────────────────────────────────
export default function TalkingHead({
  text,
  isSpeaking,
  voiceTier,
  onSpeakEnd,
  voiceRate = 1.05,
  voicePitch = 1.0,
  size = "md",
}: TalkingHeadProps) {
  const dim = size === "sm" ? "w-16 h-16" : "w-64 h-64";
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
      }

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

  // Camera distance scales with widget size
  const camZ = size === "sm" ? 3.8 : 2.8;

  return (
    <div className={`relative ${dim} mx-auto select-none`}>
      <Canvas
        camera={{ position: [0, 0.1, camZ], fov: 40 }}
        style={{ borderRadius: "50%", border: "3px solid #dc2626" }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1.2} />
        <directionalLight position={[-2, 1, 3]} intensity={0.4} color="#aaccff" />
        <Suspense fallback={null}>
          <ColbyModel mouthOpen={mouthOpen} />
        </Suspense>
      </Canvas>

      {/* Voice tier badge */}
      {isSpeaking && (
        <div className="absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white z-10">
          {voiceTier === "premium" ? "🎙 EL" : "🔊 BR"}
        </div>
      )}

      {isSpeaking && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
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
