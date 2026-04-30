export class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function notFound(msg) { return new AppError('NOT_FOUND', msg, 404); }
export function badRequest(msg) { return new AppError('BAD_REQUEST', msg, 400); }
export function forbidden(msg) { return new AppError('FORBIDDEN', msg, 403); }
export function unavailable(msg) { return new AppError('UNAVAILABLE', msg, 503); }
