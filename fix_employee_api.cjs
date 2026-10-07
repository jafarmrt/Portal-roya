const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "const newEmp = { ...empData, id: newId, workExperiences: [], skills: [] };",
  "const newEmp = { ...empData, id: newId, username: empData.email ? empData.email.split('@')[0] : `user_${Date.now()}`, password: '123', avatarUrl: empData.avatar || '', workExperiences: [], skills: [] };"
);

fs.writeFileSync('server.ts', code);
