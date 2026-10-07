const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "import { getOrCreateUser } from './src/db/users.js';",
  "import { getOrCreateUser } from './src/db/users.js';\nimport { INITIAL_EMPLOYEES, INITIAL_POLLS } from './src/data/mockData.js';\nimport { getAllPolls, createPoll, voteOnPoll } from './src/db/polls.js';\nimport { db } from './src/db/index.js';\nimport { polls } from './src/db/schema.js';"
);

code = code.replace(
  "// Vite middleware for development",
  `// API for Employees
  app.get('/api/employees', (req, res) => {
    // Strip passwords from employees
    const safeEmployees = INITIAL_EMPLOYEES.map(emp => {
      const { password, ...safeEmp } = emp;
      return safeEmp;
    });
    res.json(safeEmployees);
  });

  // Simple mock login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = INITIAL_EMPLOYEES.find(e => e.username === username && e.password === password);
    if (user) {
      const { password: _, ...safeEmp } = user;
      res.json({ success: true, user: safeEmp });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // API for Polls
  app.get('/api/polls', async (req, res) => {
    try {
      // Fetch polls from DB
      const dbPolls = await getAllPolls();
      // Combine with INITIAL_POLLS if DB is empty for demo, but DB is better.
      // Let's just seed DB with INITIAL_POLLS if empty
      const existing = await db.select().from(polls);
      if (existing.length === 0 && INITIAL_POLLS.length > 0) {
        for (const p of INITIAL_POLLS) {
          try {
            await createPoll(p as any);
            if (p.votedUserIds && p.votedUserIds.length > 0) {
                // Ignore seeding votes for now to avoid complexity
            }
          } catch(e) {}
        }
      }
      const allPolls = await getAllPolls();
      res.json(allPolls);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/polls', async (req, res) => {
    try {
      await createPoll(req.body);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  // Vite middleware for development`
);

fs.writeFileSync('server.ts', code);
