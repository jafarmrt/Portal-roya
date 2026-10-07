const fs = require('fs');
let code = fs.readFileSync('src/components/colleagues/ColleaguesDirectory.tsx', 'utf8');

code = code.replace(
  '<UserProfileModal\n        user={selectedUserForView}\n        onClose={() => setSelectedUserForView(null)}\n        onEdit={(usr) => setSelectedUserForEdit(usr)}\n      />',
  '{selectedUserForView && <UserProfileModal\n        user={selectedUserForView}\n        onClose={() => setSelectedUserForView(null)}\n        onEdit={(usr) => setSelectedUserForEdit(usr)}\n      />}'
);

code = code.replace(
  '<EditProfileModal\n        user={selectedUserForEdit}\n        onClose={() => setSelectedUserForEdit(null)}\n      />',
  '{selectedUserForEdit && <EditProfileModal\n        user={selectedUserForEdit}\n        onClose={() => setSelectedUserForEdit(null)}\n      />}'
);

fs.writeFileSync('src/components/colleagues/ColleaguesDirectory.tsx', code);
