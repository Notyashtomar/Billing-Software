'use client';

import { motion, useReducedMotion } from 'framer-motion';

const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const LOGO_SRC = '/brand/bird-group-logo.png';

export default function BirdGroupLogoMark() {
  const prefersReducedMotion = useReducedMotion() === true;

  return (
    <motion.div
      className="landing-logo"
      initial={
        prefersReducedMotion
          ? { opacity: 1, scale: 1 }
          : { opacity: 0, scale: 0.86 }
      }
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.7,
        ease: ENTER_EASE,
      }}
    >
      <motion.div
        className="landing-logo__spin"
        animate={prefersReducedMotion ? { rotate: 0 } : { rotate: 360 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: 16, ease: 'linear', repeat: Infinity }
        }
      >
        <img
          src={LOGO_SRC}
          alt=""
          width={160}
          height={160}
          className="landing-logo__mark"
          draggable={false}
        />
      </motion.div>
    </motion.div>
  );
}
