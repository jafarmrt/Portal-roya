const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Ensure settings is imported from schema
if (!code.includes('settings } from')) {
  code = code.replace(
    "calendarEvents } from './src/db/schema.js';",
    "calendarEvents, settings } from './src/db/schema.js';"
  );
}

const apiCode = `
  // --- SETTINGS API ---
  app.get('/api/settings', async (req, res) => {
    try {
      const allSettings = await db.select().from(settings);
      if (allSettings.length > 0) {
        res.json(allSettings[0]);
      } else {
        const defaultSettings = {
          id: 'global',
          departments: ['طراحی و توسعه محصول', 'فروش و امور مشتریان', 'منابع انسانی', 'فناوری اطلاعات (IT)', 'بازرگانی و تامین', 'انبار و زنجیره تامین'],
          newsCategories: ['اخبار سازمان', 'اطلاعیه هام', 'بخشنامه', 'رویداد و جشن'],
          trainingCategories: ['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش']
        };
        await db.insert(settings).values(defaultSettings);
        res.json(defaultSettings);
      }
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.post('/api/settings', requireManager, async (req, res) => {
    try {
      const { departments, newsCategories, trainingCategories } = req.body;
      
      const allSettings = await db.select().from(settings);
      if (allSettings.length === 0) {
        await db.insert(settings).values({
          id: 'global',
          departments: departments || [],
          newsCategories: newsCategories || [],
          trainingCategories: trainingCategories || []
        });
      } else {
        await db.update(settings).set({
          departments: departments || [],
          newsCategories: newsCategories || [],
          trainingCategories: trainingCategories || []
        }).where(eq(settings.id, 'global'));
      }
      
      const updated = await db.select().from(settings).where(eq(settings.id, 'global'));
      broadcast('settings_updated', updated[0]);
      res.json(updated[0]);
    } catch(e) {
      console.log(e);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });
`;

code = code.replace(
  "  app.listen(PORT, \"0.0.0.0\", () => {",
  apiCode + "\n  app.listen(PORT, \"0.0.0.0\", () => {"
);

fs.writeFileSync('server.ts', code);
