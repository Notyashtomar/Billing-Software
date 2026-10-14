import 'client-only';

type GsapInstance = typeof import('gsap').gsap;

let gsapWithInertiaPromise: Promise<GsapInstance> | null = null;
let gsapWithScrollTriggerPromise: Promise<{
  gsap: GsapInstance;
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
}> | null = null;

export async function getGsapModule(): Promise<GsapInstance> {
  return (await import('gsap')).gsap;
}

export async function getGsapWithInertiaPlugin(): Promise<GsapInstance> {
  if (!gsapWithInertiaPromise) {
    gsapWithInertiaPromise = (async () => {
      const [{ gsap }, { InertiaPlugin }] = await Promise.all([
        import('gsap'),
        import('gsap/InertiaPlugin'),
      ]);
      gsap.registerPlugin(InertiaPlugin);
      return gsap;
    })();
  }
  return gsapWithInertiaPromise;
}

export async function getGsapWithScrollTrigger() {
  if (!gsapWithScrollTriggerPromise) {
    gsapWithScrollTriggerPromise = (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    })();
  }
  return gsapWithScrollTriggerPromise;
}
