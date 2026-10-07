const fs = require('fs');

let navCode = fs.readFileSync('src/components/Navigation.tsx', 'utf8');
navCode = navCode.replace(
  "import { BarChart2, usePortal } from '../context/PortalContext';",
  "import { usePortal } from '../context/PortalContext';"
);
navCode = navCode.replace(
  "Settings\n} from 'lucide-react';",
  "Settings,\n  BarChart2\n} from 'lucide-react';"
);
fs.writeFileSync('src/components/Navigation.tsx', navCode);
