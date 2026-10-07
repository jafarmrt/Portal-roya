const fs = require('fs');

function replaceFile(path, replacements) {
  let code = fs.readFileSync(path, 'utf8');
  for (let r of replacements) {
    code = code.replace(r.search, r.replace);
  }
  fs.writeFileSync(path, code);
}

// 1. AddEmployeeModal
replaceFile('src/components/colleagues/AddEmployeeModal.tsx', [
  {
    search: "const [department, setDepartment] = useState('طراحی و توسعه محصول');",
    replace: "const [department, setDepartment] = useState(appSettings?.departments[0] || '');"
  },
  {
    search: "const { addEmployee } = usePortal();",
    replace: "const { addEmployee, appSettings } = usePortal();"
  },
  {
    search: /<select\s+value=\{department\}[\s\S]*?<\/select>/,
    replace: `<select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 bg-white outline-hidden"
              >
                {appSettings?.departments.map(dep => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>`
  }
]);

// 2. EditProfileModal
replaceFile('src/components/colleagues/EditProfileModal.tsx', [
  {
    search: "const { updateUserProfile, userRole } = usePortal();",
    replace: "const { updateUserProfile, userRole, appSettings } = usePortal();"
  },
  {
    search: /<select\s+value=\{department\}[\s\S]*?<\/select>/,
    replace: `<select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 bg-white outline-hidden"
              >
                {appSettings?.departments.map(dep => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>`
  }
]);

// 3. ColleaguesDirectory
replaceFile('src/components/colleagues/ColleaguesDirectory.tsx', [
  {
    search: "const { employees, currentUser, userRole } = usePortal();",
    replace: "const { employees, currentUser, userRole, appSettings } = usePortal();"
  },
  {
    search: /const DEPARTMENTS = \[[\s\S]*?\];/,
    replace: "const DEPARTMENTS = [{id: 'all', label: 'همه بخش‌ها'}, ...(appSettings?.departments.map(d => ({id: d, label: d})) || [])];"
  }
]);

// 4. CreatePollModal
replaceFile('src/components/polls/CreatePollModal.tsx', [
  {
    search: "const { addPoll } = usePortal();",
    replace: "const { addPoll, appSettings } = usePortal();"
  },
  {
    search: /<select\s+value=\{department\}[\s\S]*?<\/select>/,
    replace: `<select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
            >
              <option value="all">همه سازمان (عمومی)</option>
              {appSettings?.departments.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>`
  }
]);

// 5. AddNewsModal
replaceFile('src/components/news/AddNewsModal.tsx', [
  {
    search: "const { addNews } = usePortal();",
    replace: "const { addNews, appSettings } = usePortal();"
  },
  {
    search: "const [category, setCategory] = useState<NewsItem['category']>('اخبار سازمان');",
    replace: "const [category, setCategory] = useState<string>(appSettings?.newsCategories[0] || 'اخبار سازمان');"
  },
  {
    search: /<select\s+value=\{category\}[\s\S]*?<\/select>/,
    replace: `<select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
              >
                {appSettings?.newsCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>`
  }
]);

// 6. NewsModule
replaceFile('src/components/news/NewsModule.tsx', [
  {
    search: "const { news, currentUser, userRole } = usePortal();",
    replace: "const { news, currentUser, userRole, appSettings } = usePortal();"
  },
  {
    search: "const [selectedCategory, setSelectedCategory] = useState<'همه' | NewsItem['category']>('همه');",
    replace: "const [selectedCategory, setSelectedCategory] = useState<string>('همه');"
  },
  {
    search: /const CATEGORIES: \('همه' \| NewsItem\['category'\]\)\[\] = \[[\s\S]*?\];/,
    replace: "const CATEGORIES = ['همه', ...(appSettings?.newsCategories || [])];"
  }
]);

// 7. AddTrainingModal
replaceFile('src/components/training/AddTrainingModal.tsx', [
  {
    search: "const { addTraining } = usePortal();",
    replace: "const { addTraining, appSettings } = usePortal();"
  },
  {
    search: "const [category, setCategory] = useState<TrainingProgram['category']>('نرم‌افزار');",
    replace: "const [category, setCategory] = useState<string>(appSettings?.trainingCategories[0] || 'نرم‌افزار');"
  },
  {
    search: /<select\s+value=\{category\}[\s\S]*?<\/select>/,
    replace: `<select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
              >
                {appSettings?.trainingCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>`
  }
]);

// 8. TrainingModule
replaceFile('src/components/training/TrainingModule.tsx', [
  {
    search: "const { trainings, currentUser, userRole } = usePortal();",
    replace: "const { trainings, currentUser, userRole, appSettings } = usePortal();"
  },
  {
    search: "const [selectedCategory, setSelectedCategory] = useState<'همه' | TrainingProgram['category']>('همه');",
    replace: "const [selectedCategory, setSelectedCategory] = useState<string>('همه');"
  },
  {
    search: /const CATEGORIES: \('همه' \| TrainingProgram\['category'\]\)\[\] = \[[\s\S]*?\];/,
    replace: "const CATEGORIES = ['همه', ...(appSettings?.trainingCategories || [])];"
  }
]);

