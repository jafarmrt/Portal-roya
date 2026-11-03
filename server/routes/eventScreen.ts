import path from 'path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { featureState } from '../../shared/features.js';
import { SCREEN_SESSION_HOURS } from '../../shared/specialEvents.js';
import { config } from '../config.js';
import { featureConfig } from '../features.js';
import { HttpError, route } from '../http.js';
import { createScreen, SCREEN_COOKIE, screenOf, screenView } from './specialEvents.js';

// The big screen in the hall opens the portal without an account: it shows a 4-digit code, an organizer
// types it on their phone, and from then on the screen only reads the event it was paired with. It can
// change nothing, and the cookie it holds is good for this screen alone.

export const eventScreenRouter = Router();

const helloLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: config.isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'درخواست‌ها زیاد است. چند دقیقه دیگر دوباره امتحان کنید.' },
});

async function requireOn() {
  if (featureState(await featureConfig(), 'specialEvents') === 'off') throw new HttpError(404, 'مسیر یافت نشد.');
}

const tokenOf = (req: { cookies?: Record<string, string> }) => req.cookies?.[SCREEN_COOKIE];

/** A new screen gets a code to show; a screen already paired (or still waiting) keeps what it has. */
eventScreenRouter.post(
  '/event_screen/hello',
  helloLimiter,
  route(async (req, res) => {
    await requireOn();
    const screen = await screenOf(tokenOf(req));
    if (screen && screen.expiresAt.getTime() > Date.now()) {
      res.json(screen.pairedAt ? { paired: true } : { paired: false, code: screen.code, expiresAt: screen.expiresAt.toISOString() });
      return;
    }
    const created = await createScreen();
    res.cookie(SCREEN_COOKIE, created.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: SCREEN_SESSION_HOURS * 3600_000,
      path: '/api/event_screen',
    });
    res.json({ paired: false, code: created.code, expiresAt: created.expiresAt.toISOString() });
  }),
);

/** What the screen shows now; asked for every second or so. */
eventScreenRouter.get(
  '/event_screen/state',
  route(async (req, res) => {
    await requireOn();
    const screen = await screenOf(tokenOf(req));
    if (!screen || screen.expiresAt.getTime() <= Date.now() || (screen.pairedAt && !screen.eventId)) {
      throw new HttpError(401, 'این صفحه هنوز به رویدادی وصل نشده است.', 'NO_SCREEN');
    }
    if (!screen.pairedAt || !screen.eventId) {
      res.json({ paired: false, code: screen.code, expiresAt: screen.expiresAt.toISOString() });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ paired: true, ...(await screenView(screen.eventId)) });
  }),
);

/** Team pictures and colleagues' photos, for a paired screen (it has no session for /uploads). */
eventScreenRouter.get(
  '/event_screen/file/:name',
  route(async (req, res) => {
    await requireOn();
    const screen = await screenOf(tokenOf(req));
    if (!screen?.pairedAt || screen.expiresAt.getTime() <= Date.now()) throw new HttpError(401, 'این صفحه به رویدادی وصل نیست.');
    const name = String(req.params.name);
    if (!/^[\w-]+\.(jpe?g|png|webp|gif)$/i.test(name)) throw new HttpError(404, 'فایل پیدا نشد.');
    // `root` keeps the dot-file check to the name itself, so an upload folder under a dot folder still works.
    res.sendFile(name, { root: path.resolve(config.uploadDir), dotfiles: 'deny', maxAge: '1h' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'فایل پیدا نشد.' });
    });
  }),
);
