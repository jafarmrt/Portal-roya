// Thin JSON client for the portal API. The session lives in an HttpOnly cookie,
// so requests only need to be same-origin.

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registers a callback for expired sessions (401 on an authenticated request). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.');
  }

  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, data?.error || 'خطای ناشناخته در سرور.', data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export interface UploadedFile {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<UploadedFile>('POST', '/api/uploads', form);
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'خطای ناشناخته رخ داد.';
}
