'use client';

import {
  ElementType,
  useEffect,
  useRef,
  useState,
  createElement,
  useMemo,
  useCallback,
} from 'react';
import { useReducedMotion } from 'framer-motion';

interface TextTypeProps {
  className?: string;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: string | React.ReactNode;
  cursorBlinkDuration?: number;
  cursorClassName?: string;
  text: string | string[];
  as?: ElementType;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  loop?: boolean;
  textColors?: string[];
  variableSpeed?: { min: number; max: number };
  onSentenceComplete?: (sentence: string, index: number) => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
}

const TextType = ({
  text,
  as: Component = 'div',
  typingSpeed = 60,
  initialDelay = 0,
  pauseDuration = 2000,
  loop = false,
  className = '',
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = '|',
  cursorClassName = '',
  cursorBlinkDuration = 0.6,
  textColors = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible = false,
  reverseMode = false,
  ...props
}: TextTypeProps & React.HTMLAttributes<HTMLElement>) => {
  const prefersReducedMotion = useReducedMotion() === true;
  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);
  const firstText = textArray[0] ?? '';
  const instantText = reverseMode ? firstText.split('').reverse().join('') : firstText;

  const [displayedText, setDisplayedText] = useState(
    prefersReducedMotion ? instantText : '',
  );
  const [currentCharIndex, setCurrentCharIndex] = useState(
    prefersReducedMotion ? instantText.length : 0,
  );
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const [isInitialDelayComplete, setIsInitialDelayComplete] = useState(
    prefersReducedMotion || initialDelay === 0,
  );

  const containerRef = useRef<HTMLElement>(null);
  const sentenceCompleteFiredRef = useRef(false);
  const onSentenceCompleteRef = useRef(onSentenceComplete);

  useEffect(() => {
    onSentenceCompleteRef.current = onSentenceComplete;
  }, [onSentenceComplete]);

  useEffect(() => {
    sentenceCompleteFiredRef.current = false;
  }, [currentTextIndex, text]);

  const getTypingDelay = useCallback(
    (char: string) => {
      if (char === ' ') return typingSpeed * 1.8;
      if (/[.,]/.test(char)) return typingSpeed * 2.5;

      if (!variableSpeed) return typingSpeed;
      const { min, max } = variableSpeed;
      return Math.random() * (max - min) + min;
    },
    [variableSpeed, typingSpeed],
  );

  const getCurrentTextColor = () => {
    if (textColors.length === 0) return;
    return textColors[currentTextIndex % textColors.length];
  };

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true);
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsInitialDelayComplete(true);
      return;
    }

    if (!isVisible || initialDelay === 0) {
      setIsInitialDelayComplete(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsInitialDelayComplete(true);
    }, initialDelay);

    return () => clearTimeout(timer);
  }, [isVisible, initialDelay, prefersReducedMotion]);

  useEffect(() => {
    if (!isVisible || !isInitialDelayComplete) return;

    const currentText = textArray[currentTextIndex];
    const processedText = reverseMode
      ? currentText.split('').reverse().join('')
      : currentText;

    if (prefersReducedMotion) {
      setDisplayedText(processedText);
      setCurrentCharIndex(processedText.length);
      if (onSentenceCompleteRef.current && !sentenceCompleteFiredRef.current) {
        sentenceCompleteFiredRef.current = true;
        onSentenceCompleteRef.current(currentText, currentTextIndex);
      }
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;

    if (currentCharIndex < processedText.length) {
      timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + processedText[currentCharIndex]);
        setCurrentCharIndex((prev) => prev + 1);
      }, getTypingDelay(processedText[currentCharIndex]));
    } else {
      if (onSentenceCompleteRef.current && !sentenceCompleteFiredRef.current) {
        sentenceCompleteFiredRef.current = true;
        onSentenceCompleteRef.current(currentText, currentTextIndex);
      }

      if (loop && textArray.length > 1) {
        timeout = setTimeout(() => {
          setDisplayedText('');
          setCurrentCharIndex(0);
          setCurrentTextIndex((prev) => (prev + 1) % textArray.length);
        }, pauseDuration);
      }
    }

    return () => clearTimeout(timeout);
  }, [
    displayedText,
    currentCharIndex,
    isVisible,
    isInitialDelayComplete,
    pauseDuration,
    currentTextIndex,
    textArray,
    loop,
    reverseMode,
    getTypingDelay,
    prefersReducedMotion,
  ]);

  const shouldHideCursor =
    hideCursorWhileTyping &&
    currentCharIndex < textArray[currentTextIndex].length;

  const showBlinkingCursor =
    showCursor &&
    !prefersReducedMotion &&
    currentCharIndex === textArray[currentTextIndex].length;

  return createElement(
    Component,
    {
      ref: containerRef,
      className: `inline-block whitespace-pre-wrap tracking-tight ${className}`,
      ...props,
    },
    <span
      className="inline-block"
      style={{ color: getCurrentTextColor() || 'inherit' }}
    >
      {displayedText}
    </span>,
    showCursor && !prefersReducedMotion && (
      <span
        className={`ml-1 inline-block ${shouldHideCursor ? 'hidden' : ''} ${
          showBlinkingCursor ? cursorClassName : ''
        }`}
        style={{
          opacity: isInitialDelayComplete ? 1 : 0,
          animationDuration: `${cursorBlinkDuration * 2}s`,
        }}
        aria-hidden="true"
      >
        {cursorCharacter}
      </span>
    ),
  );
};

export default TextType;
