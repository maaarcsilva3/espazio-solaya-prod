import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { log } from './logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid id');
  }
  return id;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Please check the form fields.',
      errors: err.flatten().fieldErrors,
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === '23505') {
    return res.status(409).json({ message: 'That record already exists.' });
  }
  const constraint = (err as { constraint?: string })?.constraint;
  if (pgCode === '23503' && constraint === 'booking_requests_status_fkey') {
    return res.status(400).json({ message: 'That status does not exist. Refresh the page and try again.' });
  }
  if (pgCode === '23503') {
    return res.status(409).json({ message: 'This record is still in use by other records.' });
  }
  log('error', 'Unhandled request error', {
    error: err instanceof Error ? err.message : String(err),
  });
  return res.status(500).json({ message: 'Something went wrong.' });
}
