const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const defaultSystems = `
          systems: [
            { id: 'crm', name: 'سیستم CRM راهکاران', description: 'مدیریت ارتباط با مشتریان', iconName: 'Database', url: '#', bgColor: 'bg-red-50', textColor: 'text-red-700' },
            { id: 'automation', name: 'اتوماسیون اداری', description: 'مدیریت مکاتبات', iconName: 'Globe', url: '#', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
            { id: 'attendance', name: 'سیستم حضور و غیاب', description: 'ثبت تردد و درخواست مرخصی', iconName: 'CalendarClock', url: '#', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' }
          ]
`;

code = code.replace(
  "trainingCategories: ['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش']",
  "trainingCategories: ['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش']," + defaultSystems
);

fs.writeFileSync('server.ts', code);
