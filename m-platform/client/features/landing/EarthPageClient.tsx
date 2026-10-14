'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import Loader from '@/components/Landing/loading';
import {
  applySkipLandingIntroClientEffects,
  readSkipLandingIntroFlag,
} from '@/lib/login-station';

const EarthScene = dynamic(() => import('@/components/Landing/EarthScene'), {
  ssr: false,
  loading: () => (
    <div className="relative h-screen w-full overflow-hidden bg-[#03050d]" />
  ),
});

type EarthPageClientProps = {
  /** From URL / parent — resolved only after client mount (this module is ssr:false). */
  skipIntroFromUrl: boolean;
};

// Globe emergence: ease-out so it surfaces and settles with the overlay fade.
const GLOBE_REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
// Hero text exit: ease-out (not ease-in) so the fade starts immediately.
const TEXT_EXIT_EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

function resolveInitialSkipIntro(skipIntroFromUrl: boolean): boolean {
  return skipIntroFromUrl || readSkipLandingIntroFlag();
}

export default function EarthPageClient({ skipIntroFromUrl }: EarthPageClientProps) {
  const initialSkipIntro = resolveInitialSkipIntro(skipIntroFromUrl);
  const [skipIntro, setSkipIntro] = useState(initialSkipIntro);
  const [userSkipped, setUserSkipped] = useState(false);
  const [pageReady, setPageReady] = useState(initialSkipIntro);
  const [introAnimationDone, setIntroAnimationDone] = useState(initialSkipIntro);
  // Hook may return `null` before media query resolves — treat as false so
  // animate/scale props stay stable across the first client frames.
  const prefersReducedMotion = useReducedMotion() === true;

  useLayoutEffect(() => {
    const resolved = applySkipLandingIntroClientEffects(skipIntroFromUrl);
    if (resolved) {
      setSkipIntro(true);
      setPageReady(true);
      setIntroAnimationDone(true);
    }
  }, [skipIntroFromUrl]);

  useLayoutEffect(() => {
    if (!prefersReducedMotion) return;
    setUserSkipped(true);
    setPageReady(true);
    setIntroAnimationDone(true);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (skipIntro || userSkipped) {
      setPageReady(true);
      return;
    }

    const onLoad = () => setPageReady(true);

    if (document.readyState === 'complete') {
      setPageReady(true);
    } else {
      window.addEventListener('load', onLoad);
    }

    const failSafe = window.setTimeout(() => setPageReady(true), 8_000);

    return () => {
      window.removeEventListener('load', onLoad);
      window.clearTimeout(failSafe);
    };
  }, [skipIntro, userSkipped]);

  useEffect(() => {
    if (skipIntro || userSkipped || introAnimationDone) return;
    const failSafe = window.setTimeout(() => setIntroAnimationDone(true), 8_000);
    return () => window.clearTimeout(failSafe);
  }, [skipIntro, userSkipped, introAnimationDone]);

  const dismissIntro = useCallback(() => {
    setUserSkipped(true);
    setPageReady(true);
    setIntroAnimationDone(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroAnimationDone(true);
  }, []);

  const introFinished = pageReady && introAnimationDone;
  const showIntroOverlay = !skipIntro && !userSkipped && !introFinished;
  const globeRevealed = skipIntro || userSkipped || introFinished;
  const startCameraFly =
    globeRevealed && !skipIntro && !userSkipped && !prefersReducedMotion;
  const snapToTarget = skipIntro || userSkipped || prefersReducedMotion;
  const overlayMs = prefersReducedMotion ? 0.2 : 0.55;

  useEffect(() => {
    if (!showIntroOverlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissIntro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showIntroOverlay, dismissIntro]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03050d]">
      <h1 className="sr-only">
        Welcome to Bird Group. Where we imagine, innovate, inspire.
      </h1>

      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity: globeRevealed ? 1 : 0,
          scale: globeRevealed || prefersReducedMotion ? 1 : 0.96,
        }}
        transition={{
          opacity: { duration: overlayMs, ease: GLOBE_REVEAL_EASE },
          scale: { duration: overlayMs, ease: GLOBE_REVEAL_EASE },
        }}
      >
        <EarthScene
          skipIntro={skipIntro}
          startCameraFly={startCameraFly}
          snapToTarget={snapToTarget}
          reduceMotion={prefersReducedMotion}
        />
      </motion.div>

      <AnimatePresence>
        {showIntroOverlay && (
          <motion.div
            key="landing-intro"
            className="absolute inset-0 z-[9998]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: overlayMs, ease: GLOBE_REVEAL_EASE }}
          >
            <div className="absolute inset-0 bg-[#03050d]" />
            <motion.div
              className="pointer-events-none absolute inset-0 origin-center"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: prefersReducedMotion ? 1 : 1.06,
              }}
              transition={{ duration: overlayMs, ease: TEXT_EXIT_EASE }}
              aria-hidden="true"
            >
              <Loader onIntroComplete={handleIntroComplete} />
            </motion.div>
            <div className="absolute bottom-6 right-6 z-10 sm:bottom-8 sm:right-8">
              <button
                type="button"
                onClick={dismissIntro}
                className="min-h-11 rounded-full border border-white/20 bg-black/45 px-4 text-sm font-medium text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-white/40 hover:bg-black/65 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.97]"
              >
                Skip intro
                <span className="ml-2 hidden text-white/45 sm:inline">Esc</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
