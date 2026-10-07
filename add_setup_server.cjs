const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

const endpoints = `
  // System Status for Initial Setup
  app.get('/api/system/status', async (req, res) => {
    try {
      const allEmployees = await db.select().from(employees).limit(1);
      res.json({ isSetupComplete: allEmployees.length > 0 });
    } catch(e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/system/setup', async (req, res) => {
    try {
      const allEmployees = await db.select().from(employees).limit(1);
      if (allEmployees.length > 0) {
        return res.status(400).json({ error: 'System is already setup' });
      }

      const empData = req.body;
      const newId = \`emp-\${Date.now()}\`;
      const newEmp = { 
        ...empData, 
        id: newId, 
        role: 'manager', // Enforce manager role for first user
        workExperiences: [], 
        skills: [] 
      };
      await db.insert(employees).values(newEmp);
      
      res.json({ success: true, user: newEmp });
    } catch (e) {
      res.status(500).json({ error: 'Failed to setup system' });
    }
  });
`;

// Insert the endpoints before // API for Employees
serverCode = serverCode.replace('// API for Employees', endpoints + '\n  // API for Employees');

fs.writeFileSync('server.ts', serverCode);
