const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// Replace state initializers
code = code.replace(/const \[employees, setEmployees\] = useState<UserProfile\[\]>\(\(\) => \{[^}]+\}\);/m, 'const [employees, setEmployees] = useState<UserProfile[]>(INITIAL_EMPLOYEES);');
code = code.replace(/const \[polls, setPolls\] = useState<Poll\[\]>\(\(\) => \{[^}]+\}\);/m, 'const [polls, setPolls] = useState<Poll[]>(INITIAL_POLLS);');
code = code.replace(/const \[newColleagues, setNewColleagues\] = useState<NewColleagueWelcome\[\]>\(\(\) => \{[^}]+\}\);/m, 'const [newColleagues, setNewColleagues] = useState<NewColleagueWelcome[]>(INITIAL_NEW_COLLEAGUES);');
code = code.replace(/const \[trainings, setTrainings\] = useState<TrainingProgram\[\]>\(\(\) => \{[^}]+\}\);/m, 'const [trainings, setTrainings] = useState<TrainingProgram[]>(INITIAL_TRAININGS);');
code = code.replace(/const \[calendarEvents, setCalendarEvents\] = useState<CalendarEvent\[\]>\(\(\) => \{[^}]+\}\);/m, 'const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(INITIAL_CALENDAR_EVENTS);');

// Replace useEffect for SSE to include fetching all data
const sseEffect = `
  useEffect(() => {
    // Initial fetch of all data
    Promise.all([
      fetch('/api/polls').then(r => r.json()).then(setPolls).catch(console.error),
      fetch('/api/news').then(r => r.json()).then(setNews).catch(console.error),
      fetch('/api/employees').then(r => r.json()).then(setEmployees).catch(console.error),
      fetch('/api/trainings').then(r => r.json()).then(setTrainings).catch(console.error),
      fetch('/api/calendar_events').then(r => r.json()).then(setCalendarEvents).catch(console.error),
      fetch('/api/new_colleagues').then(r => r.json()).then(setNewColleagues).catch(console.error)
    ]);

    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('news_added', (e) => {
      try {
        const newNews = JSON.parse(e.data);
        setNews(prev => [newNews, ...prev]);
      } catch (err) {}
    });
    eventSource.addEventListener('refresh_polls', () => {
      fetch('/api/polls').then(res => res.json()).then(setPolls).catch(console.error);
    });
    eventSource.addEventListener('employee_added', (e) => {
      try { setEmployees(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('training_added', (e) => {
      try { setTrainings(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('calendar_event_added', (e) => {
      try { setCalendarEvents(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('new_colleague_added', (e) => {
      try { setNewColleagues(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    return () => eventSource.close();
  }, []);
`;

// Replace the old useEffect
code = code.replace(/useEffect\(\(\) => \{\s*fetch\('\/api\/polls'\).*?return \(\) => eventSource\.close\(\);\s*\}, \[\]\);/s, sseEffect.trim());

fs.writeFileSync('src/context/PortalContext.tsx', code);
