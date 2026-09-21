import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let details;
  let code;

  if (err instanceof AppError) {
    ({ status, message, details, code } = err);
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = 'Invalid identifier';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err?.code === 11000) {
    status = 409;
    message = 'A record with these details already exists';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }

  if (status >= 500 && !env.isTest) {
    console.error(`[${req.method} ${req.originalUrl}]`, {
      name: err?.name,
      code: err?.code,
      status: err?.status,
      message: err?.message,
      details: err?.details,
      cause: err?.cause
        ? {
            name: err.cause?.name,
            code: err.cause?.code,
            status: err.cause?.status,
            message: err.cause?.message,
          }
        : undefined,
      stack: err?.stack,
    });
  }

  res.status(status).json({ error: { message, ...(code && { code }), ...(details && { details }) } });
}
