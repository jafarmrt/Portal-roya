import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { BuildInfo, ChangelogEntry } from '../../types';
import { Modal, primaryButtonClass } from './Modal';

// The browser remembers the last version whose "what's new" it opened, so a dot marks a newer one.
const SEEN_KEY = 'roya-portal:seen-version';

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(version: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Without storage the dot shows again after a reload; nothing else depends on it.
  }
}

/** "build-57" → "۵۷". */
export const buildNumber = (build: string | null) => (build ? toPersianDigits(build.replace(/^build-/, '')) : '');

/** One line of the changelog: **bold** and `code` from CHANGELOG.md, without rendering any HTML. */
const ChangelogText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong>
      ) : part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
        // Commands and file names are left-to-right inside the Persian text.
        <bdi key={i} dir="ltr" className="font-mono text-xs bg-surface px-1 rounded">{part.slice(1, -1)}</bdi>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

/** "What's new": the latest versions from CHANGELOG.md, newest first. */
export const WhatsNewModal: React.FC<{ info: BuildInfo; onClose: () => void }> = ({ info, onClose }) => {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<ChangelogEntry[]>('/api/version/changelog')
      .then(setEntries)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const details = [
    info.build && `بیلد ${buildNumber(info.build)}`,
    info.builtAt && `ساخته‌شده ${formatDateTime(info.builtAt)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      title={`تازه‌های پرتال؛ نسخهٔ ${toPersianDigits(info.version)}`}
      subtitle={details || undefined}
      icon={<Sparkles className="w-5 h-5" />}
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className={primaryButtonClass}>بستن</button>}
    >
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!entries && !error && (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-red-600 animate-spin" /></div>
      )}
      {entries && entries.length === 0 && <p className="text-sm text-muted">فهرست تغییرات روی سرور پیدا نشد.</p>}
      {entries && entries.length > 0 && (
        <div className="space-y-6">
          {entries.map((entry) => (
            <section key={entry.version} aria-labelledby={`changelog-${entry.version}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${entry.version === info.version ? 'bg-red-700 text-white' : 'bg-surface text-ink-soft'}`}>
                  نسخهٔ {toPersianDigits(entry.version)}
                  {entry.version === info.version && ' (نسخهٔ فعلی)'}
                </span>
                {entry.date && <span className="text-xs text-muted">{formatDate(entry.date)}</span>}
              </div>
              {entry.title && <h4 id={`changelog-${entry.version}`} className="text-sm font-black text-ink mb-2">{entry.title}</h4>}
              <ul className="list-disc pr-5 space-y-1.5 text-xs leading-relaxed text-ink-soft">
                {entry.items.map((item, i) => (
                  <li key={i}><ChangelogText text={item} /></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
};

/** Footer line with the running version; opens "what's new". */
export const VersionInfo: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    api.get<BuildInfo>('/api/version').then(setInfo).catch(() => undefined);
  }, []);

  if (!info) return null;
  const isNew = seen !== info.version;
  const label = `نسخهٔ ${toPersianDigits(info.version)}${info.build ? ` · بیلد ${buildNumber(info.build)}` : ''}${info.builtAt ? ` · ${formatDate(info.builtAt)}` : ''}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          writeSeen(info.version);
          setSeen(info.version);
        }}
        title="تازه‌های این نسخه"
        className={`tap-area inline-flex items-center gap-1.5 underline-offset-4 hover:underline hover:text-ink ${className}`}
      >
        {isNew && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />}
        <span dir="rtl">{label}</span>
        {isNew && <span className="sr-only">(تازه)</span>}
      </button>
      {open && <WhatsNewModal info={info} onClose={() => setOpen(false)} />}
    </>
  );
};
