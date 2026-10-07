const fs = require('fs');

let serverCode = `import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, getOrCreateUser, AuthRequest } from './src/middleware/auth.js';
import { getAllPolls, createPoll, voteOnPoll } from './src/db/polls.js';
import { db } from './src/db/index.js';
import { polls, employees, news, moods, trainings, newColleagues, calendarEvents } from './src/db/schema.js';
import { requireManager } from './src/middleware/rbac.js';
import { eq, desc, and } from 'drizzle-orm';
import { Response } from 'express';

const clients = new Set<Response>();

function broadcast(event: string, data: any) {
  const message = \`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      clients.delete(client);
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Verify auth and register user
  app.post("/api/auth/verify", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user) {
        const email = req.user.email || '';
        const user = await getOrCreateUser(req.user.uid, email);
        res.json({ success: true, user });
      } else {
        res.status(401).json({ error: 'Not authenticated' });
      }
    } catch (error: any) {
      console.error('Error verifying user:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // API for Employees
  app.get('/api/employees', async (req, res) => {
    try {
      const allEmployees = await db.select().from(employees);
      const safeEmployees = allEmployees.map(emp => {
        const { password, ...safeEmp } = emp;
        return safeEmp;
      });
      res.json(safeEmployees);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch employees' });
    }
  });

  app.post('/api/employees', requireManager, async (req, res) => {
    try {
      const empData = req.body;
      const newId = \`emp-\${Date.now()}\`;
      const newEmp = { ...empData, id: newId, workExperiences: [], skills: [] };
      await db.insert(employees).values(newEmp);
      
      // Handle new colleague card
      if (empData.isNewColleague) {
        const newColleagueCard = {
          id: \`nc-\${Date.now()}\`,
          userId: newId,
          welcomeMessage: empData.newColleagueMessage || \`خوش‌آمدگویی گرم به \${empData.firstName} \${empData.lastName} که به عنوان \${empData.position} به تیم رویا طرح داخلی پیوسته است.\`,
          joinDate: empData.hireDate || new Date().toLocaleDateString('fa-IR'),
          department: empData.department,
          position: empData.position,
          likes: 1,
          wishes: []
        };
        await db.insert(newColleagues).values(newColleagueCard);
        broadcast('new_colleague_added', newColleagueCard);
      }
      
      res.json({ success: true, employee: newEmp });
      broadcast('employee_added', newEmp);
    } catch (e) {
      res.status(500).json({ error: 'Failed to add employee' });
    }
  });

  app.get('/api/new_colleagues', async (req, res) => {
    try {
      const allNewColleagues = await db.select().from(newColleagues);
      res.json(allNewColleagues);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch new colleagues' });
    }
  });

  // API for Trainings
  app.get('/api/trainings', async (req, res) => {
    try {
      const allTrainings = await db.select().from(trainings);
      res.json(allTrainings);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch trainings' });
    }
  });

  app.post('/api/trainings', requireManager, async (req, res) => {
    try {
      const tr = req.body;
      const newTr = { ...tr, id: \`tr-\${Date.now()}\`, enrolledUserIds: [] };
      await db.insert(trainings).values(newTr);
      
      res.json({ success: true, training: newTr });
      broadcast('training_added', newTr);
    } catch (e) {
      res.status(500).json({ error: 'Failed to add training' });
    }
  });

  // API for Calendar
  app.get('/api/calendar_events', async (req, res) => {
    try {
      const allEvents = await db.select().from(calendarEvents);
      res.json(allEvents);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  });

  app.post('/api/calendar_events', requireManager, async (req, res) => {
    try {
      const ev = req.body;
      const newEv = { ...ev, id: \`evt-\${Date.now()}\` };
      await db.insert(calendarEvents).values(newEv);
      
      res.json({ success: true, event: newEv });
      broadcast('calendar_event_added', newEv);
    } catch (e) {
      res.status(500).json({ error: 'Failed to add calendar event' });
    }
  });

  // Simple mock login endpoint
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const users = await db.select().from(employees).where(and(eq(employees.username, username), eq(employees.password, password)));
      if (users.length > 0) {
        const { password: _, ...safeEmp } = users[0];
        res.json({ success: true, user: safeEmp });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch(e) {
      res.status(500).json({ error: 'Login error' });
    }
  });

  // API for Polls
  app.get('/api/polls', async (req, res) => {
    try {
      const allPolls = await getAllPolls();
      res.json(allPolls);
    } catch (error) {
      console.error(error as Error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/polls', requireManager, async (req, res) => {
    try {
      await createPoll(req.body);
      res.json({ success: true });
      broadcast('refresh_polls', {});
    } catch (error) {
      console.error(error as Error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/polls/:id/vote', async (req, res) => {
    try {
      await voteOnPoll({
        pollId: req.params.id,
        userId: req.body.userId,
        optionId: req.body.optionId,
        freeText: req.body.freeText
      });
      res.json({ success: true });
      broadcast('refresh_polls', {});
    } catch (error) {
      console.error(error as Error);
      res.status(400).json({ error: (error as Error).message || 'Server error' });
    }
  });

  // --- SSE API ---
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
  });

  // --- NEWS API ---
  app.get('/api/news', async (req, res) => {
    try {
      const allNews = await db.select().from(news).orderBy(desc(news.id));
      res.json(allNews);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  app.post('/api/news', requireManager, async (req, res) => {
    try {
      const newNews = { id: \`news-\${Date.now()}\`, ...req.body };
      await db.insert(news).values(newNews);
      res.json({ success: true, news: newNews });
      broadcast('news_added', newNews);
    } catch(e) {
      res.status(500).json({ error: 'Failed to add news' });
    }
  });

  // --- MOOD API ---
  app.post('/api/moods', async (req, res) => {
    const { userId, date, mood } = req.body;
    if (!userId || !date || !mood) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
      // First, delete if existing for that user/date combination
      await db.delete(moods).where(and(eq(moods.userId, userId), eq(moods.date, date)));
      
      const newMood = { id: \`mood-\${Date.now()}\`, userId, date, mood };
      await db.insert(moods).values(newMood);
      res.json({ success: true, mood: newMood });
    } catch(e) {
      res.status(500).json({ error: 'Failed to add mood' });
    }
  });

  app.get('/api/moods/me', async (req, res) => {
    const userId = req.headers['x-user-id'] as string;
    try {
      const myMoods = await db.select().from(moods).where(eq(moods.userId, userId));
      res.json(myMoods);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch moods' });
    }
  });

  app.get('/api/moods/dashboard', requireManager, async (req, res) => {
    try {
      const allMoods = await db.select().from(moods);
      res.json(allMoods);
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch moods' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
  });
}

startServer();
`
fs.writeFileSync('server.ts', serverCode);
