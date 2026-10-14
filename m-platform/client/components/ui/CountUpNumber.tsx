// CountUpNumber Component
'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

interface CountUpNumberProps {
  value: number;
  duration?: number;
  className?: string;
}

export const CountUpNumber = ({ value, className = '' }: CountUpNumberProps) => {
  const [count, setCount] = useState(0);
  
  // Create a spring for smooth animation
  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    mass: 0.5,
  });
  
  // Transform the spring value to the count
  const displayValue = useTransform(spring, (latest) => Math.floor(latest));

  useEffect(() => {
    // Animate from 0 to the target value
    spring.set(value);
    
    // Update the state for display
    const unsubscribe = displayValue.onChange((v) => {
      setCount(v);
    });
    
    return () => unsubscribe();
  }, [value, spring, displayValue]);

  return (
    <motion.span className={className}>
      {count.toLocaleString()}
    </motion.span>
  );
};

// Alternative simpler version without Framer Motion spring:
export const SimpleCountUp = ({ value, duration = 1.5, className = '' }: CountUpNumberProps) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const durationMs = Math.max(duration * 1000, 1);
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const nextValue = progress >= 1 ? value : Math.floor(value * progress);
      setCount(nextValue);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return (
    <span className={className}>
      {count.toLocaleString()}
    </span>
  );
};