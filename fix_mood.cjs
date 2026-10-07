const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

code = code.replace(
  "const res = await fetch('/api/moods', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },\n        body: JSON.stringify({ userId: currentUserId, date: todayStr, mood })\n      });",
  "const res = await fetch('/api/moods', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },\n        body: JSON.stringify({ userId: currentUserId, date: todayStr, mood })\n      });"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
