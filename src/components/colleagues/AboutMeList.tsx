import React from 'react';
import { aboutMeAnswers, type AboutMe } from '../../../shared/aboutMe';

/** «دربارهٔ من»: the colleague's answers, each under its question. Nothing when none is filled in. */
export const AboutMeList: React.FC<{ about: AboutMe | undefined; limit?: number; className?: string }> = ({ about, limit, className = '' }) => {
  const answers = aboutMeAnswers(about).slice(0, limit);
  if (answers.length === 0) return null;
  return (
    <dl className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className}`} aria-label="دربارهٔ من">
      {answers.map((a) => (
        <div key={a.key} className="p-3 rounded-2xl bg-warm-soft/70 border border-warm/15 text-right">
          <dt className="text-xs text-muted leading-relaxed">{a.question}</dt>
          <dd className="text-sm font-bold text-ink leading-relaxed break-words">{a.answer}</dd>
        </div>
      ))}
    </dl>
  );
};
