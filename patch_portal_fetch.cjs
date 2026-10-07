const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

code = code.replace(
  "  const [employees, setEmployees] = useState<UserProfile[]>(() => {",
  `  useEffect(() => {
    fetch('/api/employees').then(res => res.json()).then(data => setEmployees(data)).catch(console.error);
    fetch('/api/polls').then(res => res.json()).then(data => setPolls(data)).catch(console.error);
  }, []);
  const [employees, setEmployees] = useState<UserProfile[]>(() => {`
);

code = code.replace(
  "const [polls, setPolls] = useState<Poll[]>(() => {",
  "const [polls, setPolls] = useState<Poll[]>(() => {"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
