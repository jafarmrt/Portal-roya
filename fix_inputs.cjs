const fs = require('fs');
let code = fs.readFileSync('src/components/colleagues/EditProfileModal.tsx', 'utf8');

code = code.replace(/useState\(user\.firstName\)/g, "useState(user.firstName || '')");
code = code.replace(/useState\(user\.lastName\)/g, "useState(user.lastName || '')");
code = code.replace(/useState\(user\.position\)/g, "useState(user.position || '')");
code = code.replace(/useState\(user\.department\)/g, "useState(user.department || '')");
code = code.replace(/useState\(user\.extension\)/g, "useState(user.extension || '')");
code = code.replace(/useState\(user\.mobile\)/g, "useState(user.mobile || '')");
code = code.replace(/useState\(user\.email\)/g, "useState(user.email || '')");
code = code.replace(/useState\(user\.birthDate\)/g, "useState(user.birthDate || '')");

fs.writeFileSync('src/components/colleagues/EditProfileModal.tsx', code);
