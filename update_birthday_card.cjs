const fs = require('fs');

let portalCode = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');
if (!portalCode.includes('birthdayWishes')) {
  portalCode = portalCode.replace(
    "export interface PortalContextType {",
    "export interface PortalContextType {\n  birthdayWishes: Record<string, { id: string; senderName: string; text: string; time: string }[]>;\n"
  );
  portalCode = portalCode.replace(
    "const [appSettings, setAppSettings] = useState<AppSettings | null>(null);",
    "const [appSettings, setAppSettings] = useState<AppSettings | null>(null);\n  const [birthdayWishes, setBirthdayWishes] = useState<Record<string, { id: string; senderName: string; text: string; time: string }[]>>({});"
  );
  portalCode = portalCode.replace(
    "const sendBirthdayWish = (birthdayUserId: string, text: string) => {",
    "const sendBirthdayWish = (birthdayUserId: string, text: string) => {\n    setBirthdayWishes(prev => ({\n      ...prev,\n      [birthdayUserId]: [...(prev[birthdayUserId] || []), { id: Date.now().toString(), senderName: currentUser.firstName + ' ' + currentUser.lastName, text, time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) }]\n    }));\n"
  );
  portalCode = portalCode.replace(
    "sendBirthdayWish,\n",
    "sendBirthdayWish,\n        birthdayWishes,\n"
  );
  fs.writeFileSync('src/context/PortalContext.tsx', portalCode);
}
