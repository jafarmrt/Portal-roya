import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Send, UserPlus, MessageSquare, Check, Trash2, Edit3, Maximize2, Phone, Mail, MapPin, Smartphone } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { formatDate, timeAgo, toPersianDigits } from '../../lib/jalali';
import type { NewColleagueWelcome, UserProfile } from '../../types';
import { IntroduceColleagueModal } from '../colleagues/IntroduceColleagueModal';

const DEFAULT_WISH = 'ورودتان به رویا طرح داخلی را صمیمانه تبریک می‌گوییم! 🎉';

/** The colleagues' welcome messages under an introduction, each removable by its writer or a moderator. */
const WishList: React.FC<{ nc: NewColleagueWelcome; tall?: boolean }> = ({ nc, tall }) => {
  const { deleteWelcomeWish, currentUser, can } = usePortal();
  if (!nc.wishes?.length) return null;
  return (
    <div className="space-y-2 pt-2">
      <span className="text-[11px] font-bold text-[#2D2D2D] flex items-center gap-1">
        <MessageSquare className="w-3.5 h-3.5 text-[#991b1b]" />
        <span>پیام‌های خوش‌آمدگویی همکاران ({toPersianDigits(nc.wishes.length)}):</span>
      </span>
      <div className={`${tall ? 'max-h-60' : 'max-h-36'} overflow-y-auto space-y-1.5 pl-1`}>
        {nc.wishes.map((w) => (
          <div key={w.id} className="p-2 bg-white rounded-lg border border-[#E6E0D5] text-[11px] flex justify-between gap-2">
            <span><strong>{w.userName}:</strong> {w.message}</span>
            <span className="flex items-start gap-1.5 text-[10px] text-[#8C867A] whitespace-nowrap">
              {timeAgo(w.time)}
              {(w.senderId === currentUser?.id || can('comments.moderate')) && (
                <button type="button" onClick={() => deleteWelcomeWish(w.id)} aria-label={`حذف پیام ${w.userName}`} title="حذف پیام" className="text-[#8C867A] hover:text-red-700">
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
        className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#991b1b] text-[#2D2D2D]"
      />
      <button
        type="button"
        onClick={() => void send()}
        className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1 ${
          sent ? 'bg-[#7f1d1d] text-white' : 'bg-[#991b1b] hover:bg-[#7f1d1d] text-white shadow-xs'
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
            className="w-56 h-56 sm:w-64 sm:h-64 rounded-3xl border-4 border-white shadow-lg text-6xl shrink-0"
          />
          <div className="space-y-3 text-center sm:text-right min-w-0">
            <div className="space-y-1">
              <h4 className="text-xl font-black text-[#2D2D2D] flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {name}
                <span className="text-[11px] px-2 py-0.5 bg-[#991b1b] text-white font-bold rounded-md">همکار جدید</span>
              </h4>
              <p className="text-sm font-bold text-[#dc2626]">
                {[colleague.position, colleague.department].filter(Boolean).join(' | ')}
              </p>
              <p className="text-xs text-[#6E6A60]">
                تاریخ پیوستن: <strong>{formatDate(nc.joinDate)}</strong>
              </p>
              {colleague.directManager && <p className="text-xs text-[#6E6A60]">مدیر مستقیم: <strong>{colleague.directManager}</strong></p>}
            </div>
            {contacts.length > 0 && (
              <ul className="space-y-1.5 text-xs text-[#4B4740]">
                {contacts.map(({ icon: Icon, label, value, ltr }) => (
                  <li key={label} className="flex items-center justify-center sm:justify-start gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-[#991b1b]" aria-hidden="true" />
                    <span className="text-[#8C867A]">{label}:</span>
                    <bdi dir={ltr ? 'ltr' : undefined} className="font-bold break-all">{value}</bdi>
                  </li>
                ))}
              </ul>
            )}
            {colleague.bio && <p className="text-xs leading-relaxed text-[#4B4740]">{colleague.bio}</p>}
          </div>
        </div>
        {nc.welcomeMessage && (
          <p className="text-sm text-[#2D2D2D] leading-relaxed bg-[#F9F7F4] p-4 rounded-2xl border border-[#E6E0D5]">"{nc.welcomeMessage}"</p>
        )}
        <WishList nc={nc} tall />
        <WishForm nc={nc} colleague={colleague} />
      </div>
    </Modal>
  );
};

export const WelcomeNewColleagueCard: React.FC = () => {
  const { newColleagues, employees, deleteIntroduction, can, isGuest } = usePortal();
  const [editing, setEditing] = useState<NewColleagueWelcome | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const canManage = can('users.manage');

  // Only colleagues introduced in the last 60 days are shown on the dashboard.
  const recent = newColleagues.filter(nc => Date.now() - new Date(nc.createdAt).getTime() < 60 * 864e5).slice(0, 3);
  const editingColleague = editing ? employees.find((e) => e.id === editing.userId) : undefined;
  const opened = recent.find((nc) => nc.id === openId);
  const openedColleague = opened ? employees.find((e) => e.id === opened.userId) : undefined;

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-[#EFEFEA] text-[#991b1b] rounded-2xl">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">معرفی همکاران جدید</h3>
            <p className="text-xs text-[#6E6A60]">ارسال پیام خوش‌آمدگویی به اعضای جدید سازمان</p>
          </div>
        </div>
        {recent.length > 0 && (
          <span className="text-xs bg-[#EFEFEA] text-[#991b1b] px-3 py-1 rounded-full font-bold border border-[#991b1b]/30">
            {toPersianDigits(recent.length)} همکار جدید
          </span>
        )}
      </div>

      {editing && editingColleague && <IntroduceColleagueModal colleague={editingColleague} card={editing} onClose={() => setEditing(null)} />}
      {opened && openedColleague && <ColleagueSpotlight nc={opened} colleague={openedColleague} onClose={() => setOpenId(null)} />}

      {recent.length === 0 ? (
        <div className="py-4 text-center space-y-1.5 text-xs">
          <p className="text-[#6E6A60]">
            {isGuest && newColleagues.length === 0 ? 'معرفی همکاران جدید پس از ورود به پرتال نمایش داده می‌شود.' : 'در دو ماه گذشته همکار جدیدی معرفی نشده است.'}
          </p>
          {canManage && (
            <p className="text-[#8C867A]">برای معرفی، هنگام «افزودن همکار» در مدیریت کارکنان تیک معرفی را بزنید یا از پروفایل همکار «معرفی به عنوان همکار جدید» را انتخاب کنید.</p>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {recent.map((nc) => {
          const colleague = employees.find(e => e.id === nc.userId);
          if (!colleague) return null;
          const name = `${colleague.firstName} ${colleague.lastName}`;

          return (
            <div key={nc.id} className="p-5 bg-gradient-to-br from-[#F5F2ED] to-[#EFEFEA]/50 rounded-2xl border border-[#E6E0D5] space-y-4">

              <div className="flex items-start gap-4">
                {/* The photo and name open the introduction large. */}
                <button
                  type="button"
                  onClick={() => setOpenId(nc.id)}
                  aria-label={`نمایش بزرگ معرفی ${name}`}
                  className="group flex-1 min-w-0 flex flex-col sm:flex-row items-center sm:items-center gap-4 text-center sm:text-right rounded-2xl focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      src={colleague.avatar}
                      firstName={colleague.firstName}
                      lastName={colleague.lastName}
                      className="w-32 h-32 sm:w-36 sm:h-36 rounded-3xl border-4 border-white shadow-md text-3xl transition-transform group-hover:scale-[1.03]"
                    />
                    <span className="absolute bottom-1.5 left-1.5 p-1.5 rounded-xl bg-white/90 text-[#991b1b] shadow-sm" aria-hidden="true">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </span>
                  </span>
                  <span className="space-y-1 min-w-0">
                    <span className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="text-lg font-black text-[#2D2D2D] group-hover:text-[#991b1b]">{name}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-[#991b1b] text-white font-bold rounded-md">همکار جدید</span>
                    </span>
                    <span className="block text-xs font-bold text-[#dc2626]">
                      {[colleague.position, colleague.department].filter(Boolean).join(' | ')}
                    </span>
                    <span className="block text-[11px] text-[#6E6A60]">
                      تاریخ پیوستن: <strong>{formatDate(nc.joinDate)}</strong>
                    </span>
                    <span className="block text-[11px] font-bold text-[#991b1b] underline-offset-4 group-hover:underline">نمایش بزرگ‌تر و اطلاعات تماس</span>
                  </span>
                </button>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setEditing(nc)} aria-label="ویرایش کارت معرفی" title="ویرایش کارت معرفی" className="p-1.5 text-[#8C867A] hover:text-[#991b1b] rounded-lg hover:bg-white">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`کارت معرفی ${name} و پیام‌های آن حذف شود؟`)) void deleteIntroduction(nc.id);
                      }}
                      aria-label="حذف کارت معرفی"
                      title="حذف کارت معرفی"
                      className="p-1.5 text-[#8C867A] hover:text-red-700 rounded-lg hover:bg-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Welcome Official Message */}
              <p className="text-xs text-[#2D2D2D] leading-relaxed bg-white p-3.5 rounded-xl border border-[#E6E0D5]">
                "{nc.welcomeMessage}"
              </p>

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
