const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// Add Mood imports
code = code.replace(
  "import {",
  "import {\n  UserMood,\n  MoodState,"
);

// Add to context type
code = code.replace(
  "userRole: UserRole;",
  "userRole: UserRole;\n  userMoods: UserMood[];\n  submitMood: (mood: MoodState) => void;\n  todayMoodSubmitted: boolean;"
);

// Add states
code = code.replace(
  "const [employees, setEmployees] = useState<UserProfile[]>(() => {",
  `const [userMoods, setUserMoods] = useState<UserMood[]>(() => {
    const saved = localStorage.getItem('roya_moods');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('roya_moods', JSON.stringify(userMoods));
  }, [userMoods]);

  const todayStr = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/([۰-۹])/g, d => String.fromCharCode(d.charCodeAt(0) - 1728));

  const submitMood = (mood: MoodState) => {
    if (!currentUserId) return;
    const newMood: UserMood = {
      id: \`mood-\${Date.now()}\`,
      userId: currentUserId,
      date: todayStr,
      mood
    };
    setUserMoods(prev => [...prev.filter(m => !(m.userId === currentUserId && m.date === todayStr)), newMood]);
  };

  const todayMoodSubmitted = currentUserId ? userMoods.some(m => m.userId === currentUserId && m.date === todayStr) : false;

  const [employees, setEmployees] = useState<UserProfile[]>(() => {`
);

// Add to provider
code = code.replace(
  "currentUser,",
  "currentUser,\n        userMoods,\n        submitMood,\n        todayMoodSubmitted,"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
