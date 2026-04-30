import { useEffect, useRef, useState } from "react";

interface TypewriterOptions {
  enabled?: boolean;
  charsPerTick?: number;
  intervalMs?: number;
}

export const useTypewriterStream = (
  targetText: string,
  { enabled = true, charsPerTick = 4, intervalMs = 24 }: TypewriterOptions = {},
): string => {
  const [visibleText, setVisibleText] = useState(targetText);
  const latestVisibleRef = useRef(visibleText);

  useEffect(() => {
    latestVisibleRef.current = visibleText;
  }, [visibleText]);

  useEffect(() => {
    if (!enabled) {
      setVisibleText(targetText);
      return;
    }

    const current = latestVisibleRef.current;
    if (!targetText.startsWith(current)) {
      setVisibleText(targetText);
      return;
    }

    if (current.length >= targetText.length) return;

    const timer = window.setInterval(() => {
      setVisibleText((previous) => {
        latestVisibleRef.current = previous;
        if (!targetText.startsWith(previous)) {
          latestVisibleRef.current = targetText;
          window.clearInterval(timer);
          return targetText;
        }

        if (previous.length >= targetText.length) {
          window.clearInterval(timer);
          return previous;
        }

        const nextLength = Math.min(targetText.length, previous.length + charsPerTick);
        const next = targetText.slice(0, nextLength);
        latestVisibleRef.current = next;
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [charsPerTick, enabled, intervalMs, targetText]);

  return visibleText;
};

