/**
 * Server/webpack stub for `framer-motion`.
 * Real package is browser-only (Worker bundle gate). Empty `{}` breaks SSR;
 * a stub that strips `initial`/`animate` causes hydration mismatches vs client FM.
 * Apply first-paint motion styles so SSR HTML matches the client's opening frame.
 */
'use strict';

const React = require('react');

function passthrough({ children }) {
  return children ?? null;
}

function motionValuesToStyle(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const out = {};
  const transforms = [];

  for (const [key, raw] of Object.entries(values)) {
    if (raw == null) continue;
    switch (key) {
      case 'opacity':
      case 'filter':
      case 'transformOrigin':
      case 'clipPath':
      case 'backgroundColor':
      case 'color':
      case 'borderRadius':
      case 'boxShadow':
      case 'zIndex':
      case 'width':
      case 'height':
      case 'top':
      case 'left':
      case 'right':
      case 'bottom':
        out[key] = raw;
        break;
      case 'transform':
        transforms.push(String(raw));
        break;
      case 'scale':
        if (raw !== 1) transforms.push(`scale(${raw})`);
        break;
      case 'scaleX':
        if (raw !== 1) transforms.push(`scaleX(${raw})`);
        break;
      case 'scaleY':
        if (raw !== 1) transforms.push(`scaleY(${raw})`);
        break;
      case 'x':
        transforms.push(
          `translateX(${typeof raw === 'number' ? `${raw}px` : raw})`,
        );
        break;
      case 'y':
        transforms.push(
          `translateY(${typeof raw === 'number' ? `${raw}px` : raw})`,
        );
        break;
      case 'z':
        transforms.push(
          `translateZ(${typeof raw === 'number' ? `${raw}px` : raw})`,
        );
        break;
      case 'rotate':
        transforms.push(
          `rotate(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      case 'rotateX':
        transforms.push(
          `rotateX(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      case 'rotateY':
        transforms.push(
          `rotateY(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      case 'rotateZ':
        transforms.push(
          `rotateZ(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      case 'skewX':
        transforms.push(
          `skewX(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      case 'skewY':
        transforms.push(
          `skewY(${typeof raw === 'number' ? `${raw}deg` : raw})`,
        );
        break;
      default:
        break;
    }
  }

  if (transforms.length > 0) {
    out.transform = transforms.join(' ');
  }
  return out;
}

function firstPaintTarget(initial, animate) {
  if (initial === false) {
    return typeof animate === 'object' && animate && !Array.isArray(animate)
      ? animate
      : {};
  }
  if (typeof initial === 'object' && initial !== null && !Array.isArray(initial)) {
    return initial;
  }
  if (typeof animate === 'object' && animate && !Array.isArray(animate)) {
    return animate;
  }
  return {};
}

function resolveFirstPaintStyle(props) {
  const { initial, animate, style } = props ?? {};
  const motionStyle = motionValuesToStyle(firstPaintTarget(initial, animate));
  const userStyle =
    style && typeof style === 'object' && !Array.isArray(style) ? style : {};
  const merged = { ...motionStyle, ...userStyle };

  // Real FM often emits `transform: none` when will-change includes transform
  // but the resolved transform is identity.
  const willChange = String(merged.willChange ?? '');
  if (
    willChange.includes('transform') &&
    (merged.transform == null || merged.transform === '')
  ) {
    merged.transform = 'none';
  }

  return merged;
}

const MOTION_ONLY_PROP_KEYS = new Set([
  'animate',
  'initial',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'whileDrag',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'dragPropagation',
  'dragControls',
  'dragListener',
  'dragSnapToOrigin',
  'dragTransition',
  'layout',
  'layoutId',
  'layoutDependency',
  'layoutRoot',
  'layoutScroll',
  'onAnimationStart',
  'onAnimationComplete',
  'onUpdate',
  'onDrag',
  'onDragStart',
  'onDragEnd',
  'onDirectionLock',
  'onHoverStart',
  'onHoverEnd',
  'onTap',
  'onTapStart',
  'onTapCancel',
  'onViewportEnter',
  'onViewportLeave',
  'viewport',
  'custom',
  'inherit',
  'transformTemplate',
]);

function createMotionComponent(tag) {
  const MotionComponent = React.forwardRef(function MotionStub(props, ref) {
    const { children, ...rest } = props ?? {};
    const resolvedStyle = resolveFirstPaintStyle(rest);
    const domProps = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key === 'style' || MOTION_ONLY_PROP_KEYS.has(key)) continue;
      domProps[key] = value;
    }
    return React.createElement(
      typeof tag === 'string' ? tag : tag,
      { ...domProps, style: resolvedStyle, ref },
      children,
    );
  });
  MotionComponent.displayName = `motion.${typeof tag === 'string' ? tag : 'custom'}`;
  return MotionComponent;
}

const motionCache = new Map();
const motion = new Proxy(
  function motionCustom(Component) {
    return createMotionComponent(Component);
  },
  {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (!motionCache.has(key)) {
        motionCache.set(key, createMotionComponent(key));
      }
      return motionCache.get(key);
    },
  },
);

/** Match FM: null until preference is known — avoids reduced-motion hydration skew. */
function useReducedMotion() {
  return null;
}

function useReducedMotionConfig() {
  return null;
}

function noopHook() {
  return undefined;
}

function useMotionValue(init) {
  return { get: () => init, set: () => undefined, on: () => () => undefined };
}

function useTransform() {
  return useMotionValue(0);
}

function useSpring(init) {
  return useMotionValue(init);
}

function useScroll() {
  return {
    scrollX: useMotionValue(0),
    scrollY: useMotionValue(0),
    scrollXProgress: useMotionValue(0),
    scrollYProgress: useMotionValue(0),
  };
}

function useInView() {
  return false;
}

function useAnimation() {
  return {
    start: async () => undefined,
    stop: () => undefined,
    set: () => undefined,
    mount: () => () => undefined,
  };
}

const exportsApi = {
  motion,
  m: motion,
  AnimatePresence: passthrough,
  LazyMotion: passthrough,
  MotionConfig: passthrough,
  LayoutGroup: passthrough,
  Reorder: {
    Group: createMotionComponent('ul'),
    Item: createMotionComponent('li'),
  },
  useReducedMotion,
  useReducedMotionConfig,
  useMotionValue,
  useTransform,
  useSpring,
  useScroll,
  useInView,
  useAnimation,
  useAnimationControls: useAnimation,
  useAnimate: () => [React.useRef(null), async () => undefined],
  usePresence: () => [true, () => undefined],
  useIsPresent: () => true,
  useCycle: (...args) => [args[0], () => undefined],
  useDragControls: () => ({ start: () => undefined }),
  useAnimationFrame: noopHook,
  useMotionTemplate: (...parts) => parts.join(''),
  useMotionValueEvent: noopHook,
  useTime: () => useMotionValue(0),
  useVelocity: () => useMotionValue(0),
  useWillChange: () => ({ current: 'auto' }),
  usePageInView: () => true,
  animate: async () => undefined,
  stagger: () => 0,
  domAnimation: {},
  domMax: {},
};

module.exports = exportsApi;
module.exports.default = exportsApi;
