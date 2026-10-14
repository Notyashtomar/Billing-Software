'use client';

import Image from 'next/image';
import { useState } from 'react';

const airlineLogos = [
  { src: '/airlinelogo/airindiaexpress.png', alt: 'Air India Express' },
  { src: '/airlinelogo/gulf.png', alt: 'Gulf Air' },
  { src: '/airlinelogo/indigo.png', alt: 'IndiGo' },
  { src: '/airlinelogo/airarabia.png', alt: 'airarabia' },
  { src: '/airlinelogo/airfrance.png', alt: 'airfrance' },
  { src: '/airlinelogo/emirates.png', alt: 'emirates' },
  { src: '/airlinelogo/jazeera.png', alt: 'jazeera' },
  { src: '/airlinelogo/klm.png', alt: 'klm' },
  { src: '/airlinelogo/kuwait.png', alt: 'kuwait' },
  { src: '/airlinelogo/lufthansa.png', alt: 'lufthansa' },
  { src: '/airlinelogo/malaysia.png', alt: 'malaysia' },
  { src: '/airlinelogo/qatar.png', alt: 'qatar' },
  { src: '/airlinelogo/spicejet.png', alt: 'spicejet' },
  { src: '/airlinelogo/vistara.png', alt: 'vistara' },
];

export default function RunningAirlineLogos() {
  const [isPaused, setIsPaused] = useState(false);
  const marqueeLogos = [...airlineLogos, ...airlineLogos];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-10 w-full overflow-hidden bg-transparent py-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >

      <div
        className="airline-marquee-track flex w-max items-center gap-5 px-4 sm:gap-6 sm:px-6"
        style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
      >
        {marqueeLogos.map((logo, index) => (
          <div
            key={`${logo.alt}-${index}`}
            className="group/logo relative flex h-20 w-24 shrink-0 items-center justify-center sm:h-24 sm:w-28"
          >
            <Image
              src={logo.src}
              alt={logo.alt}
              fill
              sizes="(max-width: 640px) 96px, 112px"
              priority={index < 4}
              className="object-contain opacity-75 transition-all duration-300 group-hover/logo:scale-110 group-hover/logo:opacity-100 group-hover/logo:drop-shadow-[0_0_14px_rgba(16,185,129,0.45)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
