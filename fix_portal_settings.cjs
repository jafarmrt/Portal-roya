const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// 1. Add to interface PortalContextType
if (!code.includes('appSettings: AppSettings | null;')) {
  code = code.replace(
    "interface PortalContextType {",
    "interface PortalContextType {\n  appSettings: AppSettings | null;\n  updateSettings: (settings: AppSettings) => void;"
  );
}

// 2. Add to Provider value
if (!code.includes('appSettings,\n        updateSettings,')) {
  code = code.replace(
    "        setIsAuthModalOpen,\n",
    ""
  );
  
  code = code.replace(
    "        deleteNotification,\n        getGlobalSearchResults\n      }}",
    "        deleteNotification,\n        getGlobalSearchResults,\n        appSettings,\n        updateSettings\n      }}"
  );
}

fs.writeFileSync('src/context/PortalContext.tsx', code);
