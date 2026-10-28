import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import { attachUser, isReadRequest, requirePasswordChanged, requireUserOrGuest, type AuthedRequest } from './auth.js';
import { config } from './config.js';
import { pool } from './db/index.js';
import { addClient } from './events.js';
import { requireVisibleFeature } from './features.js';
import { currentUser, errorHandler, route } from './http.js';
import { authRouter } from './routes/auth.js';
import { calendarRouter } from './routes/calendar.js';
import { documentsRouter } from './routes/documents.js';
import { employeesRouter } from './routes/employees.js';
import { moodsRouter } from './routes/moods.js';
import { newsRouter } from './routes/news.js';
import { notificationsRouter } from './routes/notifications.js';
import { pollsRouter } from './routes/polls.js';
import { rolesRouter } from './routes/roles.js';
import { settingsRouter } from './routes/settings.js';
import { trainingsRouter } from './routes/trainings.js';
import { uploadsRouter } from './routes/uploads.js';
import { departmentPagesRouter } from './routes/departmentPages.js';
import { guidesRouter } from './routes/guides.js';
import { searchRouter } from './routes/search.js';
import { reportsRouter } from './routes/reports.js';
import { auditRouter } from './routes/audit.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { buildInfo, changelog } from './version.js';

/** Builds the API application. The static/Vite front-end is attached in server/index.ts. */
export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // Vite's dev server injects inline scripts, so the CSP is only enforced in production.
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'"],
              upgradeInsecureRequests: config.cookieSecure ? [] : null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/healthz', route(async (_req, res) => {
    await pool.query('select 1');
    const { version, build } = buildInfo();
    res.json({ status: 'ok', version, build });
  }));

  const api = Router();
  // Public: setup status, first-run setup, login/logout. /auth/me and change-password check the session themselves.
  api.use(authRouter);
  // Which version is running and what changed in it; shown in the footer, also on the login page.
  api.get('/version', (_req, res) => res.json(buildInfo()));
  api.get('/version/changelog', (_req, res) => res.json(changelog().slice(0, 15)));

  // Everything below requires a signed-in user who has replaced their temporary password,
  // except the read-only endpoints that visitors may open while guest access is enabled.
  api.use(attachUser, requireUserOrGuest(), requirePasswordChanged);
  // Parts of the portal that are switched off, or in preview for the pilot group, until they are introduced.
  api.use(requireVisibleFeature);
  api.get('/events', (req, res) => addClient(currentUser(req as AuthedRequest).id, res));
  api.use(employeesRouter);
  api.use(newsRouter);
  api.use(pollsRouter);
  api.use(trainingsRouter);
  api.use(calendarRouter);
  api.use(moodsRouter);
  api.use(notificationsRouter);
  api.use(settingsRouter);
  api.use(rolesRouter);
  api.use(documentsRouter);
  api.use(guidesRouter);
  api.use(departmentPagesRouter);
  api.use(searchRouter);
  api.use(reportsRouter);
  api.use(auditRouter);
  api.use(suggestionsRouter);
  api.use(uploadsRouter);
  api.use((_req, res) => res.status(404).json({ error: 'مسیر یافت نشد.' }));

  app.use('/api', api);

  // Uploaded files (news images, document downloads) follow the same rule as the API.
  app.use(
    '/uploads',
    attachUser,
    requireUserOrGuest(isReadRequest),
    express.static(config.uploadDir, {
      index: false,
      dotfiles: 'deny',
      setHeaders: (res, filePath) => {
        if (!/\.(jpe?g|png|webp|gif)$/i.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
      },
    }),
  );

  app.use(errorHandler);
  return app;
}
