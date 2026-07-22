import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

/** Error with an explicit HTTP status whose message is safe to show clients. */
export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Global error handler returning structured JSON errors.
 * Only AppError/ZodError messages reach the client; everything else is generic.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: err.errors[0]?.message ?? 'Invalid input',
      fields: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}
