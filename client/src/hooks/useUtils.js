import { useEffect, useRef, useState } from 'react';

export function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const isTypingTarget = (el) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Global keyboard shortcut. `combo` like "mod+k", "n", "g t" (sequence).
 * Single-key shortcuts are ignored while typing in a field or when a dialog is open.
 */
export function useHotkey(combo, handler, { enabled = true, allowInInputs = false } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const steps = combo.toLowerCase().split(' ');
    let progress = 0;
    let resetTimer;

    const onKeyDown = (e) => {
      const hasMod = steps[progress].includes('mod+');
      if (!allowInInputs && !hasMod && (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]'))) return;
      const key = steps[progress].replace('mod+', '');
      const modOk = hasMod ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey && !e.altKey;
      if (modOk && e.key.toLowerCase() === key) {
        progress++;
        clearTimeout(resetTimer);
        if (progress === steps.length) {
          e.preventDefault();
          progress = 0;
          handlerRef.current(e);
        } else {
          resetTimer = setTimeout(() => (progress = 0), 900);
        }
      } else if (!['shift', 'control', 'meta', 'alt'].includes(e.key.toLowerCase())) {
        progress = 0;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(resetTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [combo, enabled, allowInInputs]);
}

/** Adds `is-visible` once the element scrolls into view (subtle reveal animation). */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-visible');
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Tracks whether the window has scrolled past a threshold. */
export function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
