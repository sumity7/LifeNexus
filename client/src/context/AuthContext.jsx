import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, request, setAccessToken, setUnauthorizedHandler } from '../api/client';
import { useTheme } from './ThemeContext';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);
const STARTUP_REFRESH_RETRIES = 2;
const STARTUP_REFRESH_RETRY_DELAY_MS = 1500;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | unauthenticated
  const queryClient = useQueryClient();
  const { applyPreferences, theme, accent } = useTheme();
  const toast = useToast();
  const statusRef = useRef(status);
  statusRef.current = status;

  const startSession = useCallback(
    ({ user: nextUser, accessToken }) => {
      setAccessToken(accessToken);
      setUser(nextUser);
      applyPreferences(nextUser.preferences);
      setStatus('authenticated');
    },
    [applyPreferences],
  );

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    queryClient.clear();
  }, [queryClient]);

  const startSessionRef = useRef(startSession);
  const endSessionRef = useRef(endSession);
  startSessionRef.current = startSession;
  endSessionRef.current = endSession;

  // Restore the session on page load via the httpOnly refresh cookie. A real response — even a
  // 401 "no session" — is a definitive answer and resolves immediately. A network failure (the
  // request never reached the server at all, e.g. a free-tier backend still cold-starting) is
  // NOT proof the user is logged out, so it gets a few bounded retries before giving up — one
  // failed attempt must never silently sign out someone with a perfectly valid session.
  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    const attempt = async (n) => {
      try {
        const data = await refreshSession();
        if (!cancelled) startSessionRef.current(data);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 0 && n < STARTUP_REFRESH_RETRIES) {
          retryTimer = setTimeout(() => attempt(n + 1), STARTUP_REFRESH_RETRY_DELAY_MS);
          return;
        }
        endSessionRef.current();
      }
    };
    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  // Appearance changes made anywhere (topbar toggle, palette, settings) are saved to the account.
  useEffect(() => {
    if (status !== 'authenticated' || !user) return undefined;
    if (user.preferences?.theme === theme && user.preferences?.accent === accent) return undefined;
    const timer = setTimeout(() => {
      api
        .patch('/auth/me', { preferences: { theme, accent } })
        .then((next) => setUser((current) => (current && current._id === next._id ? next : current)))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [theme, accent, status, user]);

  // Any request that can't be re-authenticated signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current !== 'authenticated') return;
      endSession();
      toast.info('Session expired', { description: 'Please sign in again to continue.' });
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession, toast]);

  const value = useMemo(
    () => ({
      user,
      status,
      login: async (credentials) => startSession(await api.post('/auth/login', credentials)),
      loginDemo: async () => startSession(await api.post('/auth/demo', {})),
      register: async (details) => startSession(await api.post('/auth/register', details)),
      logout: async () => {
        try {
          await request('/auth/logout', { method: 'POST' });
        } catch {
          /* ending the local session is what matters */
        }
        endSession();
      },
      updateProfile: async (patch) => {
        const next = await api.patch('/auth/me', patch);
        setUser(next);
        return next;
      },
      changePassword: async (body) => startSession(await api.post('/auth/change-password', body)),
      forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
      resetPassword: (body) => api.post('/auth/reset-password', body),
      deleteAccount: async (password) => {
        await api.del('/auth/me', { password });
        endSession();
      },
    }),
    [user, status, startSession, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
