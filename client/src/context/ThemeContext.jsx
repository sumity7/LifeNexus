import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'lifeos:appearance';
const ThemeContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function ThemeProvider({ children }) {
  const [appearance, setAppearance] = useState(() => ({ theme: 'system', accent: 'indigo', ...readStored() }));
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const mq = media();
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = appearance.theme === 'system' ? (systemDark ? 'dark' : 'light') : appearance.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = appearance.accent;
    writeStored(appearance);
  }, [resolvedTheme, appearance]);

  // Bails out when nothing changes so callers can apply preferences idempotently.
  const update = useCallback(
    (patch) =>
      setAppearance((prev) => (Object.entries(patch).every(([k, v]) => prev[k] === v) ? prev : { ...prev, ...patch })),
    [],
  );

  /** Syncs local appearance with preferences loaded from the server. Stable identity. */
  const applyPreferences = useCallback(
    (prefs) => prefs && update({ theme: prefs.theme ?? 'system', accent: prefs.accent ?? 'indigo' }),
    [update],
  );

  const value = useMemo(
    () => ({
      theme: appearance.theme,
      accent: appearance.accent,
      resolvedTheme,
      setTheme: (theme) => update({ theme }),
      setAccent: (accent) => update({ accent }),
      applyPreferences,
      toggleTheme: () => update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }),
    }),
    [appearance, resolvedTheme, update, applyPreferences],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
