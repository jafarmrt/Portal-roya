const fs = require('fs');

let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

const replacement = `
  const addNews = async (newsData: {
    title: string;
    summary: string;
    content: string;
    category: NewsItem['category'];
    image: string;
    tags: string[];
    isPinned?: boolean;
  }) => {
    const newArticle = {
      title: newsData.title,
      summary: newsData.summary,
      content: newsData.content,
      category: newsData.category,
      author: \`\${currentUser.firstName} \${currentUser.lastName}\`,
      authorRole: currentUser.position,
      date: new Date().toLocaleDateString('fa-IR'),
      image: newsData.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80',
      isPinned: newsData.isPinned || false,
      tags: newsData.tags,
      likesCount: 1,
      likedBy: [currentUser.id],
      commentsCount: 0
    };

    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(newArticle)
      });
      
      if (res.ok) {
        // the eventSource will update the state
        sendNotification({
          targetUserId: 'all',
          title: 'اطلاعیه/خبر جدید انتشار یافت 📰',
          message: newsData.title,
          type: 'announcement',
          linkTab: 'news'
        });
      } else {
        console.error('Failed to add news');
      }
    } catch(e) {
      console.error(e);
    }
  };
`;

code = code.replace(
  /const addNews = \(newsData: \{[\s\S]*?targetUserId: 'all',[\s\S]*?linkTab: 'news'\n    \}\);\n  \};/,
  replacement.trim()
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
