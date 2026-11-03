import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { toPersianDigits } from '../shared/jalali.js';
import type { AuthedRequest, SessionUser } from './auth.js';

// zod's own messages are English («Too big: expected string to have <=100 characters»), and parse()
// below shows them to the colleague; these are said in Persian. A message written on a schema wins.
const fa = (n: unknown) => toPersianDigits(String(n));
const NUMBERS = new Set(['number', 'int', 'bigint']);
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case 'too_big':
        if (issue.origin === 'string') return `حداکثر ${fa(issue.maximum)} حرف`;
        if (issue.origin === 'array' || issue.origin === 'set') return `حداکثر ${fa(issue.maximum)} مورد`;
        if (NUMBERS.has(issue.origin)) return `حداکثر ${fa(issue.maximum)}`;
        return 'بیش از اندازه است';
      case 'too_small':
        if (issue.origin === 'string') return Number(issue.minimum) <= 1 ? 'این فیلد الزامی است' : `حداقل ${fa(issue.minimum)} حرف`;
        if (issue.origin === 'array' || issue.origin === 'set') return `حداقل ${fa(issue.minimum)} مورد`;
        if (NUMBERS.has(issue.origin)) return `حداقل ${fa(issue.minimum)}`;
        return 'کمتر از اندازه است';
      case 'invalid_type':
        return issue.input === undefined || issue.input === null ? 'این فیلد الزامی است' : 'مقدار این فیلد درست نیست';
      case 'invalid_value':
        return 'گزینهٔ انتخاب‌شده درست نیست';
      case 'invalid_format':
        return 'شکل این مقدار درست نیست';
      default:
        return undefined;
    }
  },
});

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
export function currentUser(req: AuthedRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'لطفاً وارد حساب کاربری خود شوید.');
  return req.user;
}

/** The signed-in user, or null for a visitor on a guest-readable route. */
export function viewerOf(req: AuthedRequest): SessionUser | null {
  return req.user ?? null;
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
