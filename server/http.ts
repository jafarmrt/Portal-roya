import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest, Employee } from './auth.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Handler = (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async route so thrown errors reach the error middleware. */
export const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req as AuthedRequest, res, next).catch(next);
};

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.') || '';
    throw new HttpError(400, `اطلاعات ارسالی نامعتبر است${field ? ` (${field})` : ''}: ${issue?.message ?? ''}`);
  }
  return result.data;
}

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

/** The authenticated user; only call behind requireAuth. */
export function currentUser(req: AuthedRequest): Employee {
  if (!req.user) throw new HttpError(401, 'لطفاً وارد حساب کاربری خود شوید.');
  return req.user;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: 'درخواست نامعتبر است.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
}
