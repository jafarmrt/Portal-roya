const fs = require('fs');

// 1. Fix ColleaguesDirectory.tsx
let colCode = fs.readFileSync('src/components/colleagues/ColleaguesDirectory.tsx', 'utf8');
colCode = colCode.replace(
  "const { employees, userRole, currentUser } = usePortal();",
  "const { employees, userRole, currentUser, appSettings } = usePortal();"
);
colCode = colCode.replace(
  /const departments = \[[\s\S]*?\];/,
  `const departments = [\n    { id: 'all', label: 'همه دپارتمان‌ها' },\n    ...(appSettings?.departments || []).map(d => ({ id: d, label: d }))\n  ];`
);
fs.writeFileSync('src/components/colleagues/ColleaguesDirectory.tsx', colCode);

// 2. Fix NewsModule.tsx
let newsCode = fs.readFileSync('src/components/news/NewsModule.tsx', 'utf8');
newsCode = newsCode.replace(
  "const { news, userRole, currentUser, toggleLikeNews } = usePortal();",
  "const { news, userRole, currentUser, toggleLikeNews, appSettings } = usePortal();"
);
newsCode = newsCode.replace(
  /const categories = \[[\s\S]*?\];/,
  `const categories = [\n    { id: 'all', label: 'همه موضوعات' },\n    ...(appSettings?.newsCategories || []).map(c => ({ id: c, label: c }))\n  ];`
);
fs.writeFileSync('src/components/news/NewsModule.tsx', newsCode);

// 3. Fix TrainingModule.tsx
let trnCode = fs.readFileSync('src/components/training/TrainingModule.tsx', 'utf8');
trnCode = trnCode.replace(
  "const { trainings, currentUser, userRole, enrollTraining } = usePortal();",
  "const { trainings, currentUser, userRole, enrollTraining, appSettings } = usePortal();"
);
trnCode = trnCode.replace(
  /const categories = \[[\s\S]*?\];/,
  `const categories = [\n    { id: 'all', label: 'همه دوره‌ها' },\n    ...(appSettings?.trainingCategories || []).map(c => ({ id: c, label: c }))\n  ];`
);
fs.writeFileSync('src/components/training/TrainingModule.tsx', trnCode);
