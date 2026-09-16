export class AppError extends Error {
  constructor(status, message, { details, code } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export const notFound = (resource = 'Resource') => new AppError(404, `${resource} not found`);
export const badRequest = (message, details) => new AppError(400, message, { details });
