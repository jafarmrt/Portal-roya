const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

code = code.replace(
  "const currentUser = currentUserId ? employees.find(e => e.id === currentUserId) || employees[0] : employees[0];",
  "const currentUser = (currentUserId ? employees.find(e => e.id === currentUserId) || employees[0] : employees[0]) || ({} as any);"
);

code = code.replace(
  "const userRole = currentUser.role;",
  "const userRole = currentUser?.role || 'employee';"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
