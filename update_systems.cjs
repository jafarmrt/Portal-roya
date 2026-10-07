const fs = require('fs');

// 1. Update types.ts
let typesCode = fs.readFileSync('src/types.ts', 'utf8');
if (!typesCode.includes('ExternalSystem')) {
  typesCode = typesCode.replace(
    "export interface AppSettings {",
    "export interface ExternalSystem {\n  id: string;\n  name: string;\n  description: string;\n  iconName: string;\n  url: string;\n  bgColor: string;\n  textColor: string;\n}\n\nexport interface AppSettings {"
  );
  typesCode = typesCode.replace(
    "trainingCategories: string[];\n}",
    "trainingCategories: string[];\n  systems?: ExternalSystem[];\n}"
  );
  fs.writeFileSync('src/types.ts', typesCode);
}
