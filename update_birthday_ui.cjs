const fs = require('fs');

let code = fs.readFileSync('src/components/dashboard/BirthdayCard.tsx', 'utf8');

code = code.replace(
  "const { employees, sendBirthdayWish, currentUser } = usePortal();",
  "const { employees, sendBirthdayWish, currentUser, birthdayWishes } = usePortal();"
);

code = code.replace(
  "              <button\n                onClick={() => handleSendWish(emp.id)}",
  `              <button\n                onClick={() => handleSendWish(emp.id)}\n                disabled={!wishTexts[emp.id]?.trim()}\n`
);

const wishesUI = `
            {/* Wishes Display */}
            {birthdayWishes[emp.id] && birthdayWishes[emp.id].length > 0 && (
              <div className="mt-3 space-y-2 max-h-32 overflow-y-auto no-scrollbar pt-2 border-t border-[#E6E0D5]">
                {birthdayWishes[emp.id].map(wish => (
                  <div key={wish.id} className="bg-white p-2.5 rounded-xl border border-[#E6E0D5] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#D97B5F]">{wish.senderName}</span>
                      <span className="text-[10px] text-[#A8A295]">{wish.time}</span>
                    </div>
                    <p className="text-xs text-[#2D2D2D] leading-relaxed">{wish.text}</p>
                  </div>
                ))}
              </div>
            )}
`;

if (!code.includes('{/* Wishes Display */}')) {
  code = code.replace(
    "            </div>\n          </div>\n        ))}",
    "            </div>\n" + wishesUI + "          </div>\n        ))}"
  );
}

fs.writeFileSync('src/components/dashboard/BirthdayCard.tsx', code);
