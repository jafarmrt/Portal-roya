const fs = require('fs');
let typesStr = fs.readFileSync('src/types.ts', 'utf8');

typesStr += `
export type MoodState = 'عالی' | 'خوب' | 'معمولی' | 'بد' | 'خیلی بد';

export interface UserMood {
  id: string;
  userId: string;
  date: string;
  mood: MoodState;
}
`;

fs.writeFileSync('src/types.ts', typesStr);
