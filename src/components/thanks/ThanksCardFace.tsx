import React, { useId } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import type { ThanksPerson, ThanksValue } from './thanksStore';

const TONES = ['sage', 'crimson', 'sky', 'terracotta', 'gold', 'plum', 'teal', 'slate'];

/** The class that gives a value its colours; an unknown tone (an older client, a new list) reads as slate. */
export const toneClass = (tone: string | undefined) => `sp-tone-${tone && TONES.includes(tone) ? tone : 'slate'}`;

// Each value has a motif of its own behind its name, so two cards differ by more than their colour:
// linked rings for working together, a firm lattice for taking responsibility, rising arcs for
// learning, petals for caring about the customer, sparks for a new idea.
const MOTIFS: Record<string, { size: number; shape: React.ReactNode }> = {
  sage: {
    size: 28,
    shape: (
      <>
        <circle cx="9" cy="14" r="7.5" />
        <circle cx="19" cy="14" r="7.5" />
      </>
    ),
  },
  crimson: { size: 20, shape: <path d="M10 1 19 10 10 19 1 10Z M10 6 14 10 10 14 6 10Z" /> },
  sky: { size: 30, shape: <path d="M1 22a14 14 0 0 1 28 0 M7 22a8 8 0 0 1 16 0 M13 22a2 2 0 0 1 4 0" /> },
  terracotta: { size: 26, shape: <path d="M13 13c-6-2-7-8 0-11 7 3 6 9 0 11Zm0 0c6 2 7 8 0 11-7-3-6-9 0-11Zm0 0c-2 6-8 7-11 0 3-7 9-6 11 0Zm0 0c2-6 8-7 11 0-3 7-9 6-11 0Z" /> },
  gold: { size: 24, shape: <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" /> },
  plum: { size: 18, shape: <circle cx="9" cy="9" r="3.5" /> },
  teal: { size: 22, shape: <path d="M1 8 11 2l10 6M1 16l10-6 10 6" /> },
  slate: { size: 16, shape: <path d="M0 8h16M8 0v16" /> },
};

/** The value's motif, repeated across whatever it is laid behind. */
export const Motif: React.FC<{ tone: string }> = ({ tone }) => {
  const id = useId();
  const motif = MOTIFS[tone] ?? MOTIFS.slate;
  return (
    <svg className="sp-motif" aria-hidden="true">
      <defs>
        <pattern id={id} width={motif.size} height={motif.size} patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {motif.shape}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

const Who: React.FC<{ person: ThanksPerson | null; fallback: string }> = ({ person, fallback }) => {
  const [first, ...rest] = (person?.name ?? fallback).split(' ');
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {person ? (
        <Avatar src={person.avatar} firstName={first} lastName={rest.join(' ')} className="w-7 h-7 rounded-full text-[10px] shrink-0 ring-2 ring-white" />
      ) : (
        <span className="w-7 h-7 rounded-full shrink-0 border-2 border-dashed border-line-strong" />
      )}
      <span className={`text-xs font-bold truncate ${person ? 'text-ink' : 'text-faint'}`}>{person?.name ?? fallback}</span>
    </span>
  );
};

/**
 * A recognition as a card in its value's colour: who thanked whom, for which value, and the message.
 * The coins are not part of it: only the sender and the receiver ever see them, so whoever shows the
 * card to one of the two adds them in `children`.
 */
export const ThanksCardFace: React.FC<{
  value: ThanksValue | null;
  from: ThanksPerson | null;
  to: ThanksPerson | null;
  message: string;
  /** Shown in place of an empty message (the give form's preview). */
  placeholder?: string;
  isPrivate?: boolean;
  /** Under the header on the right: when it was sent, or its state. */
  note?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ value, from, to, message, placeholder, isPrivate, note, children, className = '' }) => (
  <article className={`sp-card ${toneClass(value?.tone)} ${className}`}>
    <header className="sp-card-head">
      <Motif tone={value?.tone ?? 'slate'} />
      <span className="font-display text-base leading-none pt-0.5">{value?.label ?? 'برای کدام ارزش؟'}</span>
      <span className="flex items-center gap-2 text-xs font-bold text-white/90">
        {isPrivate && (
          <span className="inline-flex items-center gap-1" title="فقط شما دو نفر این قدردانی را می‌بینید">
            <Lock className="w-3 h-3" /> فقط ما دو نفر
          </span>
        )}
        {note}
      </span>
    </header>
    <div className="sp-card-body space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <Who person={from} fallback="فرستنده" />
        <ArrowLeft className="w-3.5 h-3.5 text-faint shrink-0" aria-label="به" />
        <Who person={to} fallback="همکار را انتخاب کنید" />
      </div>
      <p className={`sp-card-message text-sm ${message ? '' : '!text-faint'}`}>{message || placeholder}</p>
      {children}
    </div>
  </article>
);
