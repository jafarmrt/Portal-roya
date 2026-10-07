const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

const setupLogic = `
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
  "const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);",
  "const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);\n" + setupLogic
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
