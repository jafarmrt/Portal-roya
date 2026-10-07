const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// Add isSetupComplete and completeSetup to interface
code = code.replace(
  'interface PortalContextType {',
  'interface PortalContextType {\n  isSetupComplete: boolean | null;\n  completeSetup: (user: UserProfile) => void;'
);

// Add state to Provider
code = code.replace(
  'const [notifications, setNotifications] = useState<NotificationItem[]>(() => {',
  'const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);\n  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {'
);

// Fetch system status
const fetchLogic = `
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/system/status');
        const data = await res.json();
        setIsSetupComplete(data.isSetupComplete);
      } catch (err) {
        setIsSetupComplete(true); // Fallback to true if error
      }
    };
    checkSetup();
  }, []);

  const completeSetup = (user: UserProfile) => {
    setIsSetupComplete(true);
    setCurrentUserId(user.id);
    setEmployees([user]);
  };
`;

code = code.replace(
  'useEffect(() => {\n    fetchData();',
  fetchLogic + '\n  useEffect(() => {\n    fetchData();'
);

code = code.replace(
  'isLoggedIn,\n        login,',
  'isSetupComplete,\n        completeSetup,\n        isLoggedIn,\n        login,'
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
