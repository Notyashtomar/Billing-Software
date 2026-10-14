'use client';

export async function loadGsap() {
  return (await import('gsap')).gsap;
}

export async function loadGsapWithInertia() {
  const [{ gsap }, { InertiaPlugin }] = await Promise.all([
    import('gsap'),
    import('gsap/InertiaPlugin'),
  ]);
  gsap.registerPlugin(InertiaPlugin);
  return gsap;
}

export async function loadGsapWithScrollTrigger() {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}
