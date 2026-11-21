import React, { useEffect } from 'react';
import type { EffectsLevel } from '../effects';
import { TourBox, tourPrimary, tourSecondary } from './TourBox';
import { askSkip, endTour, goToStep, useTour } from './tourStore';

// The short tour of «برنامهٔ سپاس» for whoever looks after the programme (plan: ب۲), the first time
// they open the page, or from the «؟» menu of «سپاس». It works while «سپاس» is still switched off.

export type ProgrammeSection = 'reports' | 'numbers' | 'fairness' | 'rules' | 'values';

const STEPS: { section?: ProgrammeSection; title: string; text: React.ReactNode }[] = [
  {
    title: 'برنامهٔ سپاس در دست شماست',
    text: <p>اینجا پنج بخش دارد: گزارش‌ها، گزارش ماه، انصاف، قواعد سکه و ارزش‌ها. حتی وقتی «سپاس» هنوز خاموش است، می‌توانید همه‌چیز را آماده کنید.</p>,
  },
  {
    section: 'reports',
    title: 'گزارش‌ها',
    text: (
      <>
        <p>وقتی کسی پیامی را گزارش کند، اینجا می‌آید: فقط همان پیام و یادداشت گیرنده، هرگز مقدار. دو راه دارید:</p>
        <ul className="list-disc ps-5 space-y-1">
          <li>«دیدم، بماند»: به گزارش‌دهنده خبر می‌رسد.</li>
          <li>«برگرداندن…»: با دلیلی که هر دو نفر می‌خوانند.</li>
        </ul>
        <p>عدد کنار منو یعنی گزارش‌های باز.</p>
      </>
    ),
  },
  {
    section: 'numbers',
    title: 'گزارش ماه',
    text: <p>هر ماه چند نفر قدردانی کردند و گرفتند، به تفکیک واحد و ارزش، و چند سکه بخشیده شد یا سوخت. فقط شمارش است: نه نامی، نه مقدار هر نفر، نه رتبه‌بندی‌ای.</p>,
  },
  {
    section: 'fairness',
    title: 'انصاف',
    text: <p>کسانی که سه ماه قدردانی‌ای نگرفته‌اند، قدردانی میان واحدها و «رو به بالا»، و علامت‌ها (تبادل دوطرفهٔ پیاپی، متن تکراری). این بخش نام دارد و فقط برای شماست، نه مدیران واحدها؛ برای دیدن کار دیده‌نشده است، نه قضاوت.</p>,
  },
  {
    section: 'rules',
    title: 'قواعد سکه',
    text: <p>وقتی «سپاس» روشن است، تغییر قواعد از ماه بعد اجرا می‌شود و تا آن وقت کنار قواعد فعلی نشان داده می‌شود. با «لغو تغییر» آن را پس بگیرید.</p>,
  },
  {
    section: 'values',
    title: 'ارزش‌ها',
    text: (
      <p>
        حداکثر ۸ ارزش. برای هر ارزش یک توضیح کوتاه بنویسید؛ همکاران آن را موقع قدردانی زیر نام ارزش می‌بینند. تغییر نام، رنگ و توضیح همان لحظه اعمال می‌شود، ولی کارت‌های قبلی ارزش زمان
        خودشان را نگه می‌دارند. «پنج ارزش نمونه» نمونه‌ها را با توضیح‌هایشان برمی‌گرداند.
      </p>
    ),
  },
  {
    title: 'از دیوار',
    text: <p>روی هر کارت دیوار هم «برگرداندن…» دارید. این دکمه فقط برای شما دیده می‌شود.</p>,
  },
];

export const OwnerTour: React.FC<{ fx: EffectsLevel; onSection: (section: ProgrammeSection) => void }> = ({ fx, onSection }) => {
  const { active, askingSkip } = useTour();
  const step = active?.kind === 'owner' ? active.step : -1;
  const current = step >= 0 ? STEPS[Math.min(step, STEPS.length - 1)] : null;

  useEffect(() => {
    if (current?.section) onSection(current.section);
  }, [current, onSection]);

  if (!current) return null;
  const skip = () => askSkip(true);

  if (askingSkip) {
    return (
      <TourBox
        stepKey="owner-skip"
        fx={fx}
        title="از آموزش رد می‌شوید؟"
        onEscape={() => askSkip(false)}
        actions={
          <>
            <button type="button" className={tourSecondary} onClick={() => askSkip(false)}>
              ادامه بده
            </button>
            <button type="button" className={tourPrimary} data-tour-primary onClick={() => endTour('skipped')}>
              بله، رد شو
            </button>
          </>
        }
      >
        <p>هر وقت خواستید از دکمهٔ «؟» صفحهٔ «سپاس» برش گردانید.</p>
      </TourBox>
    );
  }

  const last = step >= STEPS.length - 1;
  return (
    <TourBox
      fx={fx}
      stepKey={`owner-${step}`}
      target={current.section ? `[data-tour='prog-${current.section}']` : null}
      title={current.title}
      progress={{ step: step + 1, of: STEPS.length }}
      onSkip={last ? undefined : skip}
      onEscape={skip}
      actions={
        <button type="button" className={tourPrimary} data-tour-primary onClick={() => (last ? endTour('done') : goToStep(step + 1))}>
          {last ? 'تمام' : 'بعدی'}
        </button>
      }
    >
      {current.text}
    </TourBox>
  );
};
