const fs = require('fs');

let code = fs.readFileSync('src/db/schema.ts', 'utf8');
if (!code.includes('systems: jsonb(\'systems\')')) {
  code = code.replace(
    "trainingCategories: text('training_categories').array().notNull().default(['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش'])",
    "trainingCategories: text('training_categories').array().notNull().default(['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش']),\n  systems: jsonb('systems').$type<any[]>()"
  );
  if (!code.includes('jsonb')) {
    code = code.replace("text, boolean, integer, timestamp", "text, boolean, integer, timestamp, jsonb");
    code = code.replace("import { pgTable, text", "import { pgTable, text, jsonb");
  }
  fs.writeFileSync('src/db/schema.ts', code);
}
