const fs = require('fs');

let editCode = fs.readFileSync('src/components/colleagues/EditProfileModal.tsx', 'utf8');
editCode = editCode.replace('user: UserProfile | null;', 'user: UserProfile;');
editCode = editCode.replace('  if (!user) return null;\n', '');
fs.writeFileSync('src/components/colleagues/EditProfileModal.tsx', editCode);

let viewCode = fs.readFileSync('src/components/colleagues/UserProfileModal.tsx', 'utf8');
viewCode = viewCode.replace('user: UserProfile | null;', 'user: UserProfile;');
viewCode = viewCode.replace('  if (!user) return null;\n', '');
fs.writeFileSync('src/components/colleagues/UserProfileModal.tsx', viewCode);
