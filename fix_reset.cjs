const fs = require('fs');
let contextCode = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

contextCode = contextCode.replace(
  'resetDataToDefault: () => void;',
  ''
);

contextCode = contextCode.replace(
  /const resetDataToDefault = \(\) => {[\s\S]*?};\n/g,
  ''
);

contextCode = contextCode.replace(
  'resetDataToDefault,',
  ''
);

fs.writeFileSync('src/context/PortalContext.tsx', contextCode);

let headerCode = fs.readFileSync('src/components/Header.tsx', 'utf8');

headerCode = headerCode.replace(
  'resetDataToDefault,',
  ''
);

headerCode = headerCode.replace(
  /<button\s+onClick=\{\(\) => \{\s*resetDataToDefault\(\);\s*setIsUserMenuOpen\(false\);\s*\}\}[\s\S]*?<\/button>/g,
  ''
);

fs.writeFileSync('src/components/Header.tsx', headerCode);

