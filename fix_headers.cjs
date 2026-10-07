const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// fix addPoll
code = code.replace(
  "const res = await fetch('/api/polls', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },",
  "const res = await fetch('/api/polls', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },"
);

// fix addTraining
code = code.replace(
  "const res = await fetch('/api/trainings', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },",
  "const res = await fetch('/api/trainings', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },"
);

// fix addCalendarEvent
code = code.replace(
  "const res = await fetch('/api/calendar_events', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },",
  "const res = await fetch('/api/calendar_events', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
