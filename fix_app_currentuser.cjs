const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf8');
appCode = appCode.replace(
  "const { activeTab, isLoggedIn, isSetupComplete, isLoading, error, clearError } = usePortal();",
  "const { activeTab, isLoggedIn, isSetupComplete, isLoading, error, clearError, currentUser } = usePortal();"
);
fs.writeFileSync('src/App.tsx', appCode);

