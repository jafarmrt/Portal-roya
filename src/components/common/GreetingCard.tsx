import React from 'react';
import { Lock, Trash2 } from 'lucide-react';
import { WISH_REACTIONS, type WishDesign, type WishOccasion } from '../../../shared/celebrations';
import { timeAgo } from '../../lib/jalali';
import { Avatar } from './Avatar';

/** How each card design looks: background, ink colour and the emoji that decorate its corners. */
export const CARD_DESIGNS: Record<WishDesign, { label: string; background: string; ink: string; soft: string; motifs: [string, string] }> = {
  confetti: { label: 'جشن', background: 'linear-gradient(135deg, #FDE2D8 0%, #FBF0EC 55%, #FFF7E6 100%)', ink: '#7A2E1B', soft: '#B5654C', motifs: ['🎉', '🎊'] },
  balloons: { label: 'بادکنک', background: 'linear-gradient(135deg, #DCEBFF 0%, #EDE4FF 60%, #FCE7F3 100%)', ink: '#2E3A6B', soft: '#5B6699', motifs: ['🎈', '🎈'] },
  flowers: { label: 'گل', background: 'linear-gradient(135deg, #FCE4EC 0%, #FFF1F2 50%, #FEF3C7 100%)', ink: '#7A1F45', soft: '#A8577A', motifs: ['🌸', '🌷'] },
  cake: { label: 'کیک', background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', ink: '#6B4508', soft: '#94691F', motifs: ['🎂', '🧁'] },
  stars: { label: 'ستاره', background: 'linear-gradient(135deg, #1E2A4A 0%, #3B3486 100%)', ink: '#FFFFFF', soft: '#C9CBF2', motifs: ['✨', '⭐'] },
  coffee: { label: 'چای و شیرینی', background: 'linear-gradient(135deg, #F3E5D3 0%, #E8D3B9 100%)', ink: '#4A3220', soft: '#7D5F45', motifs: ['☕', '🍪'] },
};

export const OCCASION_TITLES: Record<WishOccasion, string> = {
  birthday: 'تولدت مبارک!',
  anniversary: 'سالگرد همکاری مبارک!',
};

interface GreetingCardProps {
  design: WishDesign;
  occasion: WishOccasion;
  text: string;
  senderName: string;
  senderAvatar?: string;
  time?: string;
  isPrivate?: boolean;
  /** The colleague's reaction; shown as a badge to everyone else. */
  reaction?: string;
  /** Given only to the colleague the card is for, who may react to it. */
  onReact?: (reaction: string) => void;
  onDelete?: () => void;
  compact?: boolean;
  /** Shown under the card, e.g. colleagues' emoji. */
  extra?: React.ReactNode;
}

/** A greeting card a colleague sent for a birthday or a work anniversary. */
export const GreetingCard: React.FC<GreetingCardProps> = ({
  design,
  occasion,
  text,
  senderName,
  senderAvatar = '',
  time,
  isPrivate,
  reaction,
  onReact,
  onDelete,
  compact,
  extra,
}) => {
  const look = CARD_DESIGNS[design] ?? CARD_DESIGNS.confetti;
  const [first = '', ...rest] = senderName.split(' ');
  return (
    <figure
      className={`relative overflow-hidden rounded-2xl border border-black/5 shadow-xs ${compact ? 'p-3' : 'p-4 sm:p-5'}`}
      style={{ background: look.background, color: look.ink }}
    >
      <span aria-hidden className={`absolute -top-1 -left-1 select-none opacity-80 rotate-[-12deg] ${compact ? 'text-2xl' : 'text-4xl'}`}>{look.motifs[0]}</span>
      <span aria-hidden className={`absolute -bottom-2 -right-1 select-none opacity-60 rotate-[10deg] ${compact ? 'text-xl' : 'text-3xl'}`}>{look.motifs[1]}</span>

      <div className="relative space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-black ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: look.soft }}>{OCCASION_TITLES[occasion]}</span>
          <span className={`flex items-center gap-1.5 text-[10px] ${compact ? 'pl-5' : 'pl-7'}`} style={{ color: look.soft }}>
            {isPrivate && (
              <span className="inline-flex items-center gap-0.5" title="فقط شما دو نفر این کارت را می‌بینید">
                <Lock className="w-3 h-3" /> خصوصی
              </span>
            )}
            {time && <span>{timeAgo(time)}</span>}
            {onDelete && (
              <button type="button" onClick={onDelete} aria-label={`حذف کارت ${senderName}`} title="حذف کارت" className="p-0.5 opacity-70 hover:opacity-100">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </span>
        </div>

        <blockquote className={`leading-relaxed whitespace-pre-line break-words ${compact ? 'text-xs' : 'text-sm font-medium'}`}>{text}</blockquote>

        <figcaption className="flex items-center justify-between gap-2 pt-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <Avatar src={senderAvatar} firstName={first} lastName={rest.join(' ')} className="w-6 h-6 rounded-full text-[9px] border border-white/60" />
            <span className="text-[11px] font-bold truncate">{senderName}</span>
          </span>
          {!onReact && reaction && (
            <span className="text-sm bg-white/70 rounded-full px-2 py-0.5 leading-none" title="واکنش صاحب کارت">{reaction}</span>
          )}
        </figcaption>

        {onReact && (
          <div className="flex items-center gap-1 pt-1" role="group" aria-label="واکنش به کارت">
            {WISH_REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onReact(reaction === r ? '' : r)}
                aria-pressed={reaction === r}
                className={`w-8 h-8 rounded-full text-base leading-none transition-all ${
                  reaction === r ? 'bg-white shadow-sm scale-110 ring-2 ring-[#D97B5F]' : 'bg-white/50 hover:bg-white/80'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {extra}
      </div>
    </figure>
  );
};
