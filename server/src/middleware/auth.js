import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';

export async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'lifeos' });
  } catch {
    throw new AppError(401, 'Your session has expired', { code: 'TOKEN_INVALID' });
  }

  // Tokens outlive account deletion by up to their TTL — make sure the user still exists.
  const exists = await User.exists({ _id: payload.sub });
  if (!exists) throw new AppError(401, 'Account no longer exists', { code: 'TOKEN_INVALID' });

  req.user = { id: payload.sub };
  next();
}
