const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/**/*.tsx');

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  let originalCode = code;
  
  // replace src={someVar} with src={someVar || undefined}
  // but only if it's not a literal string or already has ||
  code = code.replace(/src={([^}'"|]+)}/g, "src={$1 || undefined}");
  
  if (code !== originalCode) {
    fs.writeFileSync(file, code);
  }
});
