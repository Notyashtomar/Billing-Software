'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/** Deterministic binary columns — stable across SSR/CSR. */
const STABLE_BINARY_POSITIONS = Array.from({ length: 20 }, (_, i) => {
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed * 987) * 10000;
    return x - Math.floor(x);
  };

  return {
    id: i,
    left: `${pseudoRandom(i * 37) * 100}%`,
    duration: `${8 + (i % 10) * 0.9}s`,
    delay: `${(i % 5) * 0.8}s`,
    binaryString: Array.from({ length: 15 }, (_, j) =>
      pseudoRandom(i * 73 + j) > 0.5 ? '1' : '0',
    ).join(' '),
  };
});

const STATIC_BG_STYLE: CSSProperties = {
  backgroundColor: '#03050d',
  backgroundImage: `
    radial-gradient(ellipse 80% 60% at 50% 20%, rgba(16, 185, 129, 0.18), transparent 55%),
    radial-gradient(ellipse 70% 50% at 80% 80%, rgba(0, 255, 178, 0.08), transparent 50%),
    linear-gradient(180deg, #03050d 0%, #061018 45%, #03050d 100%)
  `,
};

/**
 * Login backdrop: static light plate on mobile / reduced-motion;
 * MP4 + binary rain only on md+ when motion is allowed.
 */
export default function LoginBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileMq = window.matchMedia('(max-width: 767px)');

    const syncPlayback = () => {
      const shouldPlay = !motionMq.matches && !mobileMq.matches;
      if (!shouldPlay) {
        video.pause();
        video.removeAttribute('autoplay');
        return;
      }
      video.setAttribute('autoplay', '');
      void video.play().catch(() => {
        /* autoplay blocked — static layer remains visible */
      });
    };

    syncPlayback();
    motionMq.addEventListener('change', syncPlayback);
    mobileMq.addEventListener('change', syncPlayback);
    return () => {
      motionMq.removeEventListener('change', syncPlayback);
      mobileMq.removeEventListener('change', syncPlayback);
    };
  }, []);

  return (
    <div className="relative h-full min-h-full w-full overflow-hidden bg-[#03050d]">
      {/* Light static plate — mobile + reduced-motion + video fallback */}
      <div
        className="absolute inset-0"
        style={STATIC_BG_STYLE}
        aria-hidden
      />

      {/* Heavy MP4 — desktop only, paused when prefers-reduced-motion */}
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className="absolute inset-0 hidden h-full w-full scale-110 object-cover motion-reduce:!hidden md:block"
        style={{
          filter:
            'hue-rotate(90deg) saturate(0.2) contrast(1.1) brightness(0.9)',
        }}
      >
        <source src="/media/login-bg.mp4" type="video/mp4" />
        <source src="/videos/cyber-background.webm" type="video/webm" />
      </video>

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
        aria-hidden
      />

      {/* Matrix rain — desktop + motion only (CSS gated, no JS flash) */}
      <div
        className="pointer-events-none absolute inset-0 hidden overflow-hidden motion-reduce:!hidden md:block"
        aria-hidden
      >
        {STABLE_BINARY_POSITIONS.map((binary) => (
          <div
            key={`binary-${binary.id}`}
            className="login-binary-fall absolute whitespace-nowrap font-mono text-sm tracking-widest"
            style={{
              left: binary.left,
              top: '-20px',
              animationDuration: binary.duration,
              animationDelay: binary.delay,
              color: 'rgba(16, 185, 129, 0.3)',
              textShadow: '0 0 6px rgba(16, 185, 129, 0.4)',
            }}
          >
            {binary.binaryString}
          </div>
        ))}
      </div>

      {/* Scoped keyframes — not :root / global token leak */}
      <style jsx>{`
        .login-binary-fall {
          animation-name: loginBinaryFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes loginBinaryFall {
          0% {
            transform: translateY(-100px);
            opacity: 0;
          }
          10% {
            opacity: 0.5;
          }
          90% {
            opacity: 0.5;
          }
          100% {
            transform: translateY(100vh);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-binary-fall {
            animation: none !important;
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
