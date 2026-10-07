const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

if (!code.includes('appSettings,\n        updateSettings,')) {
  code = code.replace(
    "        clearError\n      }}",
    "        clearError,\n        appSettings,\n        updateSettings\n      }}"
  );
}

fs.writeFileSync('src/context/PortalContext.tsx', code);
