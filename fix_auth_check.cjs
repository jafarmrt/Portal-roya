const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

code = code.replace(
  "const isLoggedIn = !!currentUserId;",
  "const isLoggedIn = !!currentUserId && employees.some(e => e.id === currentUserId);"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
