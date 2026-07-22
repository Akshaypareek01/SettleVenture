import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler returning structured JSON errors.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err.message || 'Internal server error';
  const status = message.includes('not found') ? 404 : message.includes('required') ? 400 : 500;
  res.status(status).json({ error: message });
}
