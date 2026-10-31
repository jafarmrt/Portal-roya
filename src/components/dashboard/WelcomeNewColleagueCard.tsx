import React, { useState } from 'react';
import { aboutMeAnswers } from '../../../shared/aboutMe';
import { AboutMeList } from '../colleagues/AboutMeList';
import { usePortal } from '../../context/PortalContext';
import { Send, UserPlus, MessageSquare, Check, Trash2, Edit3, Maximize2, Phone, Mail, MapPin, Smartphone } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { formatDate, timeAgo, toPersianDigits } from '../../lib/jalali';
import type { NewColleagueWelcome, UserProfile } from '../../types';
import { IntroduceColleagueModal } from '../colleagues/IntroduceColleagueModal';
import { ReactionBar } from '../common/ReactionBar';
import { SkeletonRows } from '../common/Placeholder';

const DEFAULT_WISH = 'ورودتان به رویا طرح داخلی را صمیمانه تبریک می‌گوییم! 🎉';

/** The colleagues' welcome messages under an introduction, each removable by its writer or a moderator. */
const WishList: React.FC<{ nc: NewColleagueWelcome; tall?: boolean }> = ({ nc, tall }) => {
  const { deleteWelcomeWish, currentUser, can } = usePortal();
  if (!nc.wishes?.length) return null;
  return (
    <div className="space-y-2 pt-2">
      <span className="text-xs font-bold text-ink flex items-center gap-1">
        <MessageSquare className="w-3.5 h-3.5 text-brand-strong" />
        <span>پیام‌های خوش‌آمدگویی همکاران ({toPersianDigits(nc.wishes.length)}):</span>
      </span>
      <div className={`${tall ? 'max-h-60' : 'max-h-36'} overflow-y-auto space-y-1.5 pl-1`}>
        {nc.wishes.map((w) => (
          <div key={w.id} className="p-2 bg-white rounded-lg border border-line text-xs flex justify-between gap-2">
            <span className="space-y-1 min-w-0">
              <span className="block"><strong>{w.userName}:</strong> {w.message}</span>
              <ReactionBar
                target="welcome"
                id={w.id}
                reactions={w.reactions ?? []}
                canReact={currentUser?.id === nc.userId}
                label={`واکنش به پیام ${w.userName}`}
                small
              />
            </span>
            <span className="flex items-start gap-1.5 text-xs text-faint whitespace-nowrap">
              {timeAgo(w.time)}
              {(w.senderId === currentUser?.id || can('comments.moderate')) && (
                <button type="button" onClick={() => deleteWelcomeWish(w.id)} aria-label={`حذف پیام ${w.userName}`} title="حذف پیام" className="text-faint hover:text-red-700">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** One line to write a welcome message; empty sends the standard congratulation. */
const WishForm: React.FC<{ nc: NewColleagueWelcome; colleague: UserProfile }> = ({ nc, colleague }) => {
  const { sendWelcomeWish, currentUser } = usePortal();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  if (nc.userId === currentUser?.id) return null;

  const send = async () => {
    if (!(await sendWelcomeWish(nc.id, text.trim() || DEFAULT_WISH))) return;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setText('');
    }, 2000);
  };

  return (
    <div className="flex items-center gap-2 pt-1">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void send()}
        placeholder="نوشتن پیام خوش‌آمدگویی صمیمانه..."
        aria-label={`پیام خوش‌آمد برای ${colleague.firstName}`}
        maxLength={500}
        className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-line rounded-xl outline-hidden focus:border-brand-strong text-ink"
      />
      <button
        type="button"
        onClick={() => void send()}
        className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1 ${
          sent ? 'bg-brand-deep text-white' : 'bg-brand-strong hover:bg-brand-deep text-white shadow-xs'
        }`}
      >
        {sent ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>ثبت شد</span>
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            <span>ارسال</span>
          </>
        )}
      </button>
    </div>
  );
};

/** The introduction opened large: a big photo, the colleague's details, the message and the welcomes. */
const ColleagueSpotlight: React.FC<{ nc: NewColleagueWelcome; colleague: UserProfile; onClose: () => void }> = ({ nc, colleague, onClose }) => {
  const { currentUser, isGuest } = usePortal();
  const name = `${colleague.firstName} ${colleague.lastName}`;
  const contacts = [
    colleague.extension && { icon: Phone, label: 'داخلی', value: toPersianDigits(colleague.extension) },
    colleague.mobile && { icon: Smartphone, label: 'همراه', value: toPersianDigits(colleague.mobile), ltr: true },
    colleague.email && { icon: Mail, label: 'ایمیل', value: colleague.email, ltr: true },
    colleague.location && { icon: MapPin, label: 'محل استقرار', value: colleague.location },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; ltr?: boolean }[];

  return (
    <Modal title={`خوش آمدید، ${name}`} subtitle="معرفی همکار جدید" icon={<UserPlus className="w-5 h-5" />} size="lg" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar
            src={colleague.avatar}
            firstName={colleague.firstName}
            lastName={colleague.lastName}
            className="w-40 h-40 sm:w-64 sm:h-64 rounded-3xl border-4 border-white shadow-lg text-5xl sm:text-6xl shrink-0"
          />
          <div className="space-y-3 text-center sm:text-right min-w-0">
            <div className="space-y-1">
              <h4 className="text-xl font-black text-ink flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {name}
                <span className="text-xs px-2 py-0.5 bg-brand-strong text-white font-bold rounded-md">همکار جدید</span>
              </h4>
              <p className="text-sm font-bold text-brand">
                {[colleague.position, colleague.department].filter(Boolean).join(' | ')}
              </p>
              <p className="text-xs text-muted">
                تاریخ پیوستن: <strong>{formatDate(nc.joinDate)}</strong>
              </p>
              {colleague.directManager && <p className="text-xs text-muted">مدیر مستقیم: <strong>{colleague.directManager}</strong></p>}
            </div>
            {contacts.length > 0 && (
              <ul className="space-y-1.5 text-xs text-ink-soft">
                {contacts.map(({ icon: Icon, label, value, ltr }) => (
                  <li key={label} className="flex items-center justify-center sm:justify-start gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-brand-strong" aria-hidden="true" />
                    <span className="text-faint">{label}:</span>
                    <bdi dir={ltr ? 'ltr' : undefined} className="font-bold break-all">{value}</bdi>
                  </li>
                ))}
              </ul>
            )}
            {colleague.bio && <p className="text-xs leading-relaxed text-ink-soft">{colleague.bio}</p>}
          </div>
        </div>
        <AboutMeList about={colleague.aboutMe} />
        {nc.welcomeMessage && (
          <p className="text-sm text-ink leading-relaxed bg-surface-soft p-4 rounded-2xl border border-line">"{nc.welcomeMessage}"</p>
        )}
        <ReactionBar target="intro" id={nc.id} reactions={nc.reactions ?? []} canReact={!isGuest && !!currentUser} label={`واکنش به معرفی ${name}`} />
        <WishList nc={nc} tall />
        <WishForm nc={nc} colleague={colleague} />
      </div>
    </Modal>
  );
};

export const WelcomeNewColleagueCard: React.FC = () => {
  const { newColleagues, employees, deleteIntroduction, can, isGuest, currentUser, isLoaded } = usePortal();
  const [editing, setEditing] = useState<NewColleagueWelcome | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const canManage = can('users.manage');

  // Only colleagues introduced in the last 60 days are shown on the dashboard.
  const recent = newColleagues.filter(nc => Date.now() - new Date(nc.createdAt).getTime() < 60 * 864e5).slice(0, 3);
  const editingColleague = editing ? employees.find((e) => e.id === editing.userId) : undefined;
  const opened = recent.find((nc) => nc.id === openId);
  const openedColleague = opened ? employees.find((e) => e.id === opened.userId) : undefined;

  return (
    <div className="bg-white rounded-3xl p-6 border border-line/70 shadow-card space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-surface-strong text-brand-strong rounded-2xl">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-ink">معرفی همکاران جدید</h3>
            <p className="text-xs text-muted">به همکاران تازه خوش‌آمد بگویید</p>
          </div>
        </div>
        {recent.length > 0 && (
          <span className="shrink-0 whitespace-nowrap text-xs bg-surface-strong text-brand-strong px-3 py-1 rounded-full font-bold border border-brand-strong/30">
            {toPersianDigits(recent.length)} همکار جدید
          </span>
        )}
      </div>

      {editing && editingColleague && <IntroduceColleagueModal colleague={editingColleague} card={editing} onClose={() => setEditing(null)} />}
      {opened && openedColleague && <ColleagueSpotlight nc={opened} colleague={openedColleague} onClose={() => setOpenId(null)} />}

      {!isGuest && !isLoaded('new_colleagues') ? (
        <SkeletonRows rows={1} tall />
      ) : recent.length === 0 ? (
        <div className="py-4 text-center space-y-1.5 text-xs">
          <p className="text-muted">
            {isGuest && newColleagues.length === 0 ? 'معرفی همکاران جدید پس از ورود به پرتال نمایش داده می‌شود.' : 'در دو ماه گذشته همکار جدیدی معرفی نشده است.'}
          </p>
          {canManage && (
            <p className="text-faint">برای معرفی، هنگام «افزودن همکار» در مدیریت کارکنان تیک معرفی را بزنید یا از پروفایل همکار «معرفی به عنوان همکار جدید» را انتخاب کنید.</p>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {recent.map((nc) => {
          const colleague = employees.find(e => e.id === nc.userId);
          if (!colleague) return null;
          const name = `${colleague.firstName} ${colleague.lastName}`;
          // One «دربارهٔ من» answer as a conversation starter; all of them in the large view.
          const firstAnswer = aboutMeAnswers(colleague.aboutMe)[0];

          return (
            <div key={nc.id} className="p-4 sm:p-5 bg-surface/70 rounded-2xl space-y-4">

              <div className="flex items-start gap-4">
                {/* The photo and name open the introduction large. */}
                <button
                  type="button"
                  onClick={() => setOpenId(nc.id)}
                  aria-label={`نمایش بزرگ معرفی ${name}`}
                  className="group flex-1 min-w-0 flex flex-row items-center gap-3 sm:gap-4 text-right rounded-2xl focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      src={colleague.avatar}
                      firstName={colleague.firstName}
                      lastName={colleague.lastName}
                      className="w-20 h-20 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl border-4 border-white shadow-md text-xl sm:text-3xl transition-transform group-hover:scale-[1.03]"
                    />
                    <span className="absolute bottom-1 left-1 p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-white/90 text-brand-strong shadow-sm" aria-hidden="true">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </span>
                  </span>
                  <span className="space-y-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-base sm:text-lg font-black text-ink group-hover:text-brand-strong">{name}</span>
                      <span className="text-xs px-2 py-0.5 bg-brand-strong text-white font-bold rounded-md">همکار جدید</span>
                    </span>
                    <span className="block text-xs font-bold text-brand">
                      {[colleague.position, colleague.department].filter(Boolean).join(' | ')}
                    </span>
                    <span className="block text-xs text-muted">
                      تاریخ پیوستن: <strong>{formatDate(nc.joinDate)}</strong>
                    </span>
                    {firstAnswer && (
                      <span className="block text-xs text-ink-soft leading-relaxed">
                        <span className="text-muted">{firstAnswer.question}</span> <strong>{firstAnswer.answer}</strong>
                      </span>
                    )}
                    <span className="block text-xs font-bold text-brand-strong underline-offset-4 group-hover:underline">نمایش بزرگ‌تر و اطلاعات تماس</span>
                  </span>
                </button>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setEditing(nc)} aria-label="ویرایش کارت معرفی" title="ویرایش کارت معرفی" className="p-1.5 text-faint hover:text-brand-strong rounded-lg hover:bg-white">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`کارت معرفی ${name} و پیام‌های آن حذف شود؟`)) void deleteIntroduction(nc.id);
                      }}
                      aria-label="حذف کارت معرفی"
                      title="حذف کارت معرفی"
                      className="p-1.5 text-faint hover:text-red-700 rounded-lg hover:bg-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Welcome Official Message */}
              <p className="text-xs text-ink leading-relaxed bg-white p-3.5 rounded-xl border border-line">
                "{nc.welcomeMessage}"
              </p>
              <ReactionBar target="intro" id={nc.id} reactions={nc.reactions ?? []} canReact={!isGuest && !!currentUser} label={`واکنش به معرفی ${name}`} />

              <WishList nc={nc} />
              <WishForm nc={nc} colleague={colleague} />

            </div>
          );
        })}
      </div>
      )}

    </div>
  );
};
