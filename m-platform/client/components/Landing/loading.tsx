'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

import { preloadLandingScene } from '@/lib/landing-preload';

import './loading.css';

const TextType = dynamic(() => import('./TextType'), { ssr: false });

const INTRO_LINE_COUNT = 4;

type LoadingProps = {
  onIntroComplete?: () => void;
};

export default function Loading({ onIntroComplete }: LoadingProps) {
  const linesDoneRef = useRef(0);

  useEffect(() => {
    preloadLandingScene();
  }, []);

  useEffect(() => {
    const failSafe = window.setTimeout(() => onIntroComplete?.(), 8_000);
    return () => window.clearTimeout(failSafe);
  }, [onIntroComplete]);

  const onLineComplete = useCallback(() => {
    linesDoneRef.current += 1;
    if (linesDoneRef.current >= INTRO_LINE_COUNT) {
      onIntroComplete?.();
    }
  }, [onIntroComplete]);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden gap-6 px-4 py-8 text-center sm:gap-10">
      <div className="flex max-w-full flex-wrap items-baseline justify-center gap-x-3 gap-y-2">
        <TextType
          text="Welcome to"
          typingSpeed={100}
          showCursor={false}
          className="text-white text-4xl font-semibold sm:text-6xl md:text-8xl"
          onSentenceComplete={onLineComplete}
        />

        <TextType
          text="BIRD GROUP"
          typingSpeed={100}
          variableSpeed={{ min: 50, max: 120 }}
          showCursor
          cursorCharacter="_"
          cursorClassName="landing-text-cursor text-emerald-400"
          className="text-emerald-500 text-4xl font-semibold glow-emerald sm:text-6xl md:text-8xl"
          initialDelay={700}
          onSentenceComplete={onLineComplete}
        />
      </div>

      <div className="flex max-w-full flex-wrap items-baseline justify-center gap-x-3 gap-y-2">
        <TextType
          text="Where we"
          typingSpeed={80}
          showCursor={false}
          className="text-white text-2xl font-semibold sm:text-3xl md:text-4xl"
          initialDelay={1400}
          onSentenceComplete={onLineComplete}
        />

        <TextType
          text="IMAGINE. INNOVATE. INSPIRE"
          typingSpeed={100}
          variableSpeed={{ min: 45, max: 110 }}
          showCursor
          cursorCharacter="_"
          cursorClassName="landing-text-cursor text-emerald-400"
          className="text-emerald-500 text-xl font-semibold glow-emerald sm:text-2xl md:text-4xl"
          initialDelay={1800}
          onSentenceComplete={onLineComplete}
        />
      </div>
    </div>
  );
}
