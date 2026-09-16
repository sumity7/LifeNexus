import { z } from 'zod';
import { isDateKey } from '../utils/dates.js';
import { COLORS } from '../constants.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const dateKey = z.string().refine(isDateKey, 'Expected a date in YYYY-MM-DD format');
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month in YYYY-MM format');
export const timeHM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time in HH:mm format');

export const requiredText = (max, label = 'Title') =>
  z.string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max, label = 'Text') =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export const tagList = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(20, 'At most 20 tags')
  .transform((arr) => [...new Set(arr)]);

export const color = z.enum(COLORS);

export const idParams = z.object({ id: objectId });
export const dateQuery = z.object({ date: dateKey.optional() });
export const dateBody = z.object({ date: dateKey.optional() });

/** Escape user input for safe use inside a RegExp. */
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
