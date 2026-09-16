import { AppError } from '../utils/AppError.js';

const formatIssues = (error) =>
  error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

/**
 * Validates request segments against Zod schemas. Parsed (and stripped) values
 * are exposed on `req.valid` — controllers must read from there, never from
 * the raw request, so unknown fields can't be mass-assigned.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid ??= {};
  for (const segment of ['params', 'query', 'body']) {
    const schema = schemas[segment];
    if (!schema) continue;
    const result = schema.safeParse(req[segment] ?? {});
    if (!result.success) {
      throw new AppError(400, 'Validation failed', { details: formatIssues(result.error), code: 'VALIDATION' });
    }
    req.valid[segment] = result.data;
  }
  next();
};
