const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// I will insert addPoll correctly.
const toggleIdx = code.indexOf('const togglePollActiveStatus =');

const correctFns = `
  const addPoll = async (pollData: {
    title: string;
    description: string;
    department: string;
    type: PollType;
    expiryDate: string;
    options: string[];
  }) => {
    const newPoll = {
      id: \`poll-\${Date.now()}\`,
      ...pollData,
      createdBy: \`\${currentUser.firstName} \${currentUser.lastName}\`,
      createdAt: todayStr,
      totalVotes: 0,
      freeTextResponses: [],
      votedUserIds: [],
      isActive: true,
      options: pollData.options.map(opt => ({
        id: \`opt-\${Date.now()}-\${Math.random().toString(36).substr(2, 5)}\`,
        text: opt,
        votesCount: 0
      }))
    };
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPoll)
      });
      if (res.ok) {
        // Refresh polls
        fetch('/api/polls').then(r=>r.json()).then(setPolls).catch(console.error);
      }
    } catch(e) { console.error(e); }
  };
`;

code = code.substring(0, toggleIdx) + correctFns + "\n  " + code.substring(toggleIdx);

// Fix fetchPolls usage in votePoll
code = code.replace("fetchPolls(); // Refresh polls", "fetch('/api/polls').then(r=>r.json()).then(setPolls).catch(console.error);");

fs.writeFileSync('src/context/PortalContext.tsx', code);
