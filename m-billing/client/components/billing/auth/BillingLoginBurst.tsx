'use client';

import dynamic from 'next/dynamic';

const Grainient = dynamic(
  () =>
    import('@/components/react-bits/Grainient').then((m) => m.default),
  { ssr: false },
);

/** Billing Finance suite — lemon light, sky accent, deep navy base. */
const BILLING_YELLOW = '#F1FF5E';
const BILLING_BLUE = '#3A9AFF';
const BILLING_NAVY = '#1C0770';

/**
 * Grainient behind Billing glass login — client-only ogl.
 * Visual only; no auth / session side effects.
 */
export default function BillingLoginBurst() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
      style={{ width: '100%', height: '100%', position: 'absolute' }}
    >
      <Grainient
        className="h-full w-full"
        color1={BILLING_YELLOW}
        color2={BILLING_BLUE}
        color3={BILLING_NAVY}
        timeSpeed={0.25}
        colorBalance={0.0}
        warpStrength={1.0}
        warpFrequency={5.0}
        warpSpeed={2.0}
        warpAmplitude={50.0}
        blendAngle={0.0}
        blendSoftness={0.05}
        rotationAmount={500.0}
        noiseScale={2.0}
        grainAmount={0.1}
        grainScale={2.0}
        grainAnimated={false}
        contrast={1.5}
        gamma={1.0}
        saturation={1.0}
        centerX={0.0}
        centerY={0.0}
        zoom={0.9}
      />
    </div>
  );
}
