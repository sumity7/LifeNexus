import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { AppError } from '../utils/AppError.js';
import { deleteAccount as removeAccount, exportUserData } from '../services/account.js';
import { getEmailProvider } from '../services/email/index.js';
import { passwordResetEmail } from '../services/email/templates.js';
import { DASHBOARD_WIDGETS } from '../constants.js';

const RESET_TOKEN_TTL_MS = 60 * 60_000; // 1 hour, single-use

export const REFRESH_COOKIE = 'lifeos_rt';
const DAY_MS = 86_400_000;
// A rotated refresh token stays usable briefly so parallel tabs/requests don't log each other out.
const ROTATION_GRACE_MS = 30_000;
// Used to keep login timing similar whether or not the email exists.
const TIMING_HASH = bcrypt.hashSync('lifeos-timing-equalizer', 10);

// In production the frontend (Vercel) and backend (Render) are different sites, so the refresh
// cookie must be SameSite=None (which browsers only honor when Secure is also set) or the browser
// will never send it back on cross-site requests. Locally, frontend and backend share a site
// (same registrable domain, different ports) so the stricter Lax/Secure-free defaults still apply.
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'strict',
  path: '/api/auth',
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (userId) =>
  jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'lifeos',
    algorithm: 'HS256',
  });

async function startSession(req, res, user) {
  const token = crypto.randomBytes(48).toString('base64url');
  await Session.create({
    user: user._id,
    tokenHash: hashToken(token),
    userAgent: req.get('user-agent')?.slice(0, 300),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * DAY_MS),
  });
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: env.REFRESH_TOKEN_DAYS * DAY_MS });
  return { user, accessToken: signAccessToken(user._id) };
}

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

export async function register(req, res) {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) {
    throw new AppError(409, 'An account with this email already exists', { code: 'EMAIL_TAKEN' });
  }
  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ data: await startSession(req, res, user) });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = user ? await user.verifyPassword(password) : (await bcrypt.compare(password, TIMING_HASH), false);
  if (!user || !valid) {
    throw new AppError(401, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  }
  res.json({ data: await startSession(req, res, user) });
}

function logRefreshFailure(reason, req) {
  if (env.isTest) return;
  console.warn(`[auth/refresh] ${reason}`, {
    hasCookieHeader: Boolean(req.headers.cookie),
    origin: req.headers.origin || null,
  });
}

export async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    logRefreshFailure('missing refresh cookie', req);
    throw new AppError(401, 'No active session', { code: 'NO_SESSION' });
  }

  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session) {
    logRefreshFailure('refresh token not found in database', req);
    clearRefreshCookie(res);
    throw new AppError(401, 'Your session has expired', { code: 'NO_SESSION' });
  }
  if (session.expiresAt < new Date()) {
    logRefreshFailure('refresh token expired', req);
    clearRefreshCookie(res);
    throw new AppError(401, 'Your session has expired', { code: 'NO_SESSION' });
  }

  const user = await User.findById(session.user);
  if (!user) {
    logRefreshFailure('user for session no longer exists', req);
    await Session.deleteMany({ user: session.user });
    clearRefreshCookie(res);
    throw new AppError(401, 'Account no longer exists', { code: 'NO_SESSION' });
  }

  if (session.revokedAt) {
    if (Date.now() - session.revokedAt.getTime() <= ROTATION_GRACE_MS) {
      // Concurrent refresh with a just-rotated token: the browser already holds the new cookie.
      return res.json({ data: { user, accessToken: signAccessToken(user._id) } });
    }
    // An old token was replayed — treat as theft and end every session for this user.
    logRefreshFailure('rotated refresh token replayed outside grace window', req);
    await Session.deleteMany({ user: user._id });
    clearRefreshCookie(res);
    throw new AppError(401, 'Your session has expired', { code: 'NO_SESSION' });
  }

  session.revokedAt = new Date();
  session.expiresAt = new Date(Date.now() + 5 * 60_000);
  await session.save();
  res.json({ data: await startSession(req, res, user) });
}

export async function logout(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  res.json({ data: user });
}

export async function updateMe(req, res) {
  const { name, preferences } = req.valid.body;
  const user = await User.findById(req.user.id);
  if (name !== undefined) user.name = name;

  if (preferences) {
    const { dashboardWidgets, notifications, ai, ...rest } = preferences;
    for (const [key, value] of Object.entries(rest)) user.preferences[key] = value;
    if (notifications) for (const [key, value] of Object.entries(notifications)) user.preferences.notifications[key] = value;
    if (ai) {
      const { scopes, ...aiRest } = ai;
      for (const [key, value] of Object.entries(aiRest)) user.preferences.ai[key] = value;
      if (scopes) for (const [key, value] of Object.entries(scopes)) user.preferences.ai.scopes[key] = value;
    }
    if (dashboardWidgets) {
      // Keep any widgets the client didn't mention so new widgets never disappear.
      const mentioned = new Set(dashboardWidgets.map((w) => w.id));
      user.preferences.dashboardWidgets = [
        ...dashboardWidgets,
        ...DASHBOARD_WIDGETS.filter((id) => !mentioned.has(id)).map((id) => ({ id, visible: true })),
      ];
    }
  }

  await user.save();
  res.json({ data: user });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) {
    throw new AppError(400, 'Current password is incorrect', {
      details: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
    });
  }
  await user.setPassword(newPassword);
  await user.save();
  // Sign out every other device.
  await Session.deleteMany({ user: user._id });
  res.json({ data: await startSession(req, res, user) });
}

/**
 * Always responds the same way regardless of whether the email exists, whether an
 * email provider is configured, or whether sending actually succeeds — a different
 * response for "email doesn't exist" is exactly how attackers enumerate accounts.
 */
export async function forgotPassword(req, res) {
  const { email } = req.valid.body;
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await PasswordReset.create({ user: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) });
    const link = `${env.clientOrigins[0]}/reset-password?token=${token}`;
    const provider = getEmailProvider();
    if (provider.available) {
      const { subject, html, text } = passwordResetEmail(user.name, link);
      try {
        await provider.send({ to: user.email, subject, html, text });
      } catch (err) {
        if (!env.isTest) console.error('Failed to send password reset email:', err.message);
      }
    }
  }
  res.json({ data: { message: "If an account exists for that email, we've sent a password reset link." } });
}

export async function resetPassword(req, res) {
  const { token, password } = req.valid.body;
  const reset = await PasswordReset.findOne({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset) throw new AppError(400, 'This reset link is invalid or has expired', { code: 'RESET_TOKEN_INVALID' });

  const user = await User.findById(reset.user);
  if (!user) throw new AppError(400, 'This reset link is invalid or has expired', { code: 'RESET_TOKEN_INVALID' });

  await user.setPassword(password);
  await user.save();
  reset.usedAt = new Date();
  await reset.save();
  // Invalidate any other outstanding reset tokens and sign out every device, same as a normal password change.
  await Promise.all([
    PasswordReset.updateMany({ user: user._id, usedAt: null }, { $set: { usedAt: new Date() } }),
    Session.deleteMany({ user: user._id }),
  ]);
  clearRefreshCookie(res);
  res.status(204).end();
}

/** Active sessions (devices) for the account; the current one is flagged. */
export async function listSessions(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  const currentHash = token ? hashToken(token) : null;
  const sessions = await Session.find({ user: req.user.id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  res.json({
    data: sessions.map((s) => ({ _id: s._id, userAgent: s.userAgent ?? '', createdAt: s.createdAt, expiresAt: s.expiresAt, current: s.tokenHash === currentHash })),
  });
}

export async function revokeSession(req, res) {
  const result = await Session.deleteOne({ _id: req.valid.params.id, user: req.user.id });
  if (!result.deletedCount) throw new AppError(404, 'Session not found');
  res.status(204).end();
}

export async function revokeOtherSessions(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  await Session.deleteMany({ user: req.user.id, ...(token && { tokenHash: { $ne: hashToken(token) } }) });
  res.status(204).end();
}

export async function exportData(req, res) {
  const data = await exportUserData(req.user.id);
  res.setHeader('Content-Disposition', `attachment; filename="lifeos-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
}

export async function deleteAccount(req, res) {
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await user.verifyPassword(req.valid.body.password))) {
    throw new AppError(400, 'Password is incorrect', { details: [{ path: 'password', message: 'Password is incorrect' }] });
  }
  await removeAccount(user._id);
  clearRefreshCookie(res);
  res.status(204).end();
}
