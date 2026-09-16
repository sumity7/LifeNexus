import { parseCapture } from '../services/capture.js';
import { serverToday } from '../utils/dates.js';

/** Parses free text into a typed draft. The client creates the entity through the normal module API. */
export async function parse(req, res) {
  const { text, date } = req.valid.body;
  res.json({ data: parseCapture(text, date ?? serverToday()) });
}
