import { mkdirSync, writeFileSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

export const AUTH_DIR = 'e2e/.auth';

/** Creates the first admin, an employee and some content, and saves both sign-ins for the tests. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync(AUTH_DIR, { recursive: true });

  const admin = await request.newContext({ baseURL });
  const ok = async (res: Awaited<ReturnType<typeof admin.post>>) => {
    if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
    return res.json() as Promise<{ id: string; temporaryPassword: string }>;
  };

  await ok(await admin.post('/api/system/setup', {
    data: { username: 'admin', password: 'Admin-pass-123', firstName: 'مدیر', lastName: 'سیستم', position: 'مدیر فناوری', department: 'فناوری اطلاعات' },
  }));
  await ok(await admin.put('/api/settings', { data: { guestAccess: true, guestDirectory: true, departments: ['فناوری اطلاعات', 'فروش', 'تولید'] } }));

  const created = await ok(await admin.post('/api/employees', {
    data: { username: 'sara', firstName: 'سارا', lastName: 'احمدی', position: 'کارشناس', department: 'فروش', role: 'employee' },
  }));

  const news = await ok(await admin.post('/api/news', {
    data: { title: 'افتتاح شعبهٔ جدید', summary: 'شعبهٔ جدید رویا افتتاح شد.', content: 'متن کامل خبر', category: 'اخبار', tags: ['شعبه'], isPinned: true },
  }));
  await ok(await admin.post('/api/news', {
    data: { title: 'بخشنامهٔ ایمنی', summary: 'لطفاً مطالعه کنید.', content: 'متن بخشنامه', category: 'بخشنامه', requiresAck: true, isUrgent: true },
  }));
  await ok(await admin.post('/api/polls', {
    data: { title: 'ناهار جمعه', questions: [{ text: 'ناهار جمعه چه باشد؟', type: 'single', options: [{ text: 'کباب' }, { text: 'سبزی' }] }] },
  }));
  await ok(await admin.post('/api/calendar_events', { data: { title: 'جلسهٔ ماهانه', date: '1405/08/20', type: 'meeting' } }));
  await admin.storageState({ path: `${AUTH_DIR}/admin.json` });

  const employee = await request.newContext({ baseURL });
  await ok(await employee.post('/api/auth/login', { data: { username: 'sara', password: created.temporaryPassword } }));
  await ok(await employee.post('/api/auth/change-password', { data: { currentPassword: created.temporaryPassword, newPassword: 'Sara-pass-123' } }));
  await employee.storageState({ path: `${AUTH_DIR}/employee.json` });

  writeFileSync(`${AUTH_DIR}/data.json`, JSON.stringify({ newsId: news.id }));
  await admin.dispose();
  await employee.dispose();
}
