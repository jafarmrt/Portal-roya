const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

code = code.replace(
  "category: 'اخبار سازمان' | 'اطلاعیه هام' | 'بخشنامه' | 'رویداد و جشن';",
  "category: string;"
);

code = code.replace(
  "category: 'نرم‌افزار' | 'مهارتهای نرم' | 'استانداردها' | 'مدیریت و فروش';",
  "category: string;"
);

code = code.replace(
  "  | 'systems';",
  "  | 'systems'\n  | 'settings';"
);

code += `
export interface AppSettings {
  id: string;
  departments: string[];
  newsCategories: string[];
  trainingCategories: string[];
}
`;

fs.writeFileSync('src/types.ts', code);
