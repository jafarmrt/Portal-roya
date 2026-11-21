import React, { useEffect, useRef } from 'react';
import { MAIN_TOUR_LAST_STEP } from '../../../../shared/recognitionTutorial';
import { toPersianDigits } from '../../../lib/jalali';
import type { EffectsLevel } from '../effects';
import { closeGive, showThanksTab, useThanks, type Wallet } from '../thanksStore';
import { TourBox, celebrate, tourPrimary, tourSecondary } from './TourBox';
import { askSkip, endTour, goToStep, useTour } from './tourStore';

// The main tutorial of «سپاس» (plan: section الف), on the real page: the wallet, then the colleague's
// first recognition, given for real, step by step in the real form, then the wall. Where a step has a
// thing to do, it waits until the colleague has done it.

const fa = toPersianDigits;

/** Where a tour kept on the server carries on: the form's steps start again from opening the form. */
export function resumeStep(step: number) {
  if (step >= 3 && step <= 8) return 2;
  if (step === 9) return 10;
  return step;
}

/** The first steps before the form: a colleague who cannot give today goes on to the wall instead. */
const cannotGive = (wallet: Wallet) => (wallet.left <= 0 ? 'coins' : wallet.writtenToday >= wallet.rules.dailyMax ? 'daily' : null);

export const MainTour: React.FC<{ wallet: Wallet; fx: EffectsLevel }> = ({ wallet, fx }) => {
  const { active, askingSkip } = useTour();
  const { giving, form, lastSent, wall, given } = useThanks();
  const step = active?.kind === 'main' ? active.step : -1;
  const name = form?.name || lastSent?.name || 'همکارتان';

  // A recognition sent from the form opened during the tour is the one the step on taking it back is about
  // (it may go before step 8, when a draft filled the form already).
  const sentBefore = useRef<string | null>(null);
  const formOpen = Boolean(giving);
  useEffect(() => {
    if (formOpen) sentBefore.current = lastSent?.id ?? null;
  }, [formOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the form opens

  // Steps that wait for the colleague to do something move on by themselves.
  useEffect(() => {
    if (step === 2 && giving) goToStep(3);
    // The form was closed half way: back to opening it, the message kept as a draft.
    if (step >= 3 && step <= 8 && !giving) {
      const just = lastSent && lastSent.id !== sentBefore.current;
      goToStep(just ? 9 : 2);
      return;
    }
    if (step === 3 && form?.to) goToStep(4);
    if (step === 4 && form?.valueId) goToStep(5);
  }, [step, giving, form?.to, form?.valueId, lastSent]);

  // Where each step needs the page to be.
  useEffect(() => {
    if (step === 9) showThanksTab('given');
    if (step === 10 || step === 11) showThanksTab('wall');
    if (step === MAIN_TOUR_LAST_STEP) celebrate(fx);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps -- once per step

  if (step < 0) return null;
  const skip = () => askSkip(true);

  if (askingSkip) {
    return (
      <TourBox
        stepKey="skip"
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
        <p>هر وقت خواستید از دکمهٔ «؟» برش گردانید.</p>
      </TourBox>
    );
  }

  // Inside the form, all of it stays in reach (another field, its close button); the lit part shows where to look.
  const common = { fx, stepKey: `main-${step}`, onSkip: skip, onEscape: skip, progress: { step, of: MAIN_TOUR_LAST_STEP }, passThrough: step >= 3 && step <= 8 };
  const next = (to: number, label = 'بعدی', disabled = false) => (
    <button type="button" className={tourPrimary} data-tour-primary disabled={disabled} onClick={() => goToStep(to)}>
      {label}
    </button>
  );
  const blocked = cannotGive(wallet);
  // Joined this month, or «سپاس» began for them this month (pilot group, or switched on mid-month).
  const newcomer = wallet.allowance < wallet.rules.allowance;
  const firstOnWall = wall.items.some((c) => !c.sealed);

  switch (step) {
    case 0:
      return (
        <TourBox
          fx={fx}
          stepKey="main-0"
          title="به «سپاس» خوش آمدید"
          onEscape={() => endTour('later')}
          actions={
            <>
              <button type="button" className={tourSecondary} onClick={() => endTour('later')}>
                بعداً
              </button>
              {next(1, 'شروع کنیم')}
            </>
          }
        >
          <p>سپاس یعنی کار خوب همکاران را ببینیم و به زبان بیاوریم. اینجا با سکه از هم قدردانی می‌کنیم.</p>
          <p>هدف رقابت نیست؛ هدف این است که زحمت هیچ‌کس دیده‌نشده نماند. در حدود سه دقیقه، اولین قدردانی‌تان را با هم می‌فرستیم.</p>
        </TourBox>
      );
    case 1:
      return (
        <TourBox {...common} target="[data-tour='wallet']" title="کیف سکهٔ شما" actions={next(2)}>
          {newcomer ? (
            <p>
              چون «سپاس» این ماه برای شما شروع شد، سهم این ماه شما به اندازهٔ روزهای مانده، {fa(wallet.allowance)} سکه است. از ماه بعد سهم کامل می‌گیرید. سکه‌هایی که تا آخر ماه نبخشید از بین می‌روند، ولی
              سکه‌هایی که از دیگران می‌گیرید همیشه می‌ماند.
            </p>
          ) : (
            <p>
              هر ماه {fa(wallet.allowance)} سکه می‌گیرید تا به دیگران هدیه بدهید. سکه‌هایی که تا آخر ماه نبخشید از بین می‌روند؛ این ماه {fa(wallet.daysLeft)} روز مانده. سکه‌هایی که از
              دیگران می‌گیرید مال خودتان است و همیشه می‌ماند.
            </p>
          )}
        </TourBox>
      );
    case 2:
      if (blocked === 'coins') {
        return (
          <TourBox {...common} target="[data-tour='wallet']" title="سکه‌های این ماه تمام شده" actions={next(10)}>
            <p>سکه‌های این ماه‌تان تمام شده. اول ماه بعد دوباره {fa(wallet.rules.allowance)} سکه می‌گیرید. تا آن موقع با واکنش‌ها روی دیوار همراهی کنید.</p>
          </TourBox>
        );
      }
      if (blocked === 'daily') {
        return (
          <TourBox {...common} target="[data-tour='wallet']" title="امروز به سقف رسیده‌اید" actions={next(10)}>
            <p>امروز به سقف {fa(wallet.rules.dailyMax)} قدردانی رسیده‌اید. بقیهٔ آموزش را ببینید و اولین قدردانی را فردا بفرستید.</p>
          </TourBox>
        );
      }
      return (
        <TourBox {...common} target="[data-tour='give']" focus="target" title="اولین قدردانی">
          <p>بیایید اولین قدردانی را با هم بفرستیم. روی «قدردانی کن» بزنید.</p>
        </TourBox>
      );
    case 3:
      if (form?.colleagues === 0) {
        return (
          <TourBox
            {...common}
            target="[data-tour='give-to']"
            title="هنوز همکاری در فهرست نیست"
            actions={
              <button
                type="button"
                className={tourPrimary}
                data-tour-primary
                onClick={() => {
                  closeGive();
                  goToStep(10);
                }}
              >
                بعدی
              </button>
            }
          >
            <p>فعلاً فقط همکاران گروه آزمایشی اینجا دیده می‌شوند و هنوز کسی در فهرست نیست. این قدم را رد می‌کنیم. وقتی همکاران اضافه شدند، از «مأموریت‌های سپاس» ادامه دهید.</p>
          </TourBox>
        );
      }
      return (
        <TourBox {...common} target="[data-tour='give-to']" focus="target" title="از چه کسی؟">
          <p>به کسی فکر کنید که این روزها کاری برایتان کرده: گرهی را باز کرد، برایتان وقت گذاشت، یا کارش را خیلی خوب انجام داد. نامش را جست‌وجو کنید.</p>
        </TourBox>
      );
    case 4:
      return (
        <TourBox {...common} target="[data-tour='give-values']" focus="target" title="کار او به کدام ارزش نزدیک است؟">
          <p>هر قدردانی به یکی از ارزش‌های ما وصل است. زیر هر ارزش توضیح کوتاهی آمده؛ ارزشی را انتخاب کنید که بیشتر به کار {name} می‌خورد.</p>
        </TourBox>
      );
    case 5: {
      const enough = Boolean(form?.enough);
      return (
        <TourBox {...common} target="[data-tour='give-message']" focus="target" title="دقیق بگویید چه کرد" actions={next(6, 'بعدی', !enough)}>
          {form?.restored && <p className="text-xs font-bold text-ink">متنی که قبلاً نوشته بودید سر جایش است. اگر خواستید کاملش کنید.</p>}
          <p>قدردانی خوب می‌گوید چه کاری کرد و چه اثری داشت. مثلاً: «شب قبل از جلسه گزارش را با من مرور کردی و جلسه خیلی خوب پیش رفت.» دست‌کم {fa(wallet.messageMin)} حرف بنویسید.</p>
          <p className={`text-xs font-bold ${enough ? 'text-emerald-700' : 'text-faint'}`}>
            {enough ? 'کافی است ✓' : `${fa(form?.letters ?? 0)} از ${fa(wallet.messageMin)} حرف`}
          </p>
        </TourBox>
      );
    }
    case 6:
      return (
        <TourBox {...common} target="[data-tour='give-amount']" title="چند سکه؟" actions={next(7)}>
          <p>
            {fa(wallet.defaultAmount)} سکه از پیش انتخاب شده؛ اگر خواستید عوضش کنید. <strong>مقدار را فقط شما و {name} می‌بینید</strong>؛ نه دیوار، نه مسئول برنامه، نه هیچ‌کس دیگر. به هر
            نفر در ماه حداکثر {fa(wallet.rules.perPersonMax)} سکه می‌شود داد.
          </p>
        </TourBox>
      );
    case 7:
      return (
        <TourBox {...common} target="[data-tour='give-visibility']" title="چه کسی ببیند؟" actions={next(8)}>
          <p>
            «همه ببینند» روی دیوار می‌آید تا همه ببینند، البته بدون مقدار. «فقط ما دو نفر» فقط بین شما دو نفر می‌ماند. اگر روی دیوار باشد، {name} هر وقت بخواهد می‌تواند آن را از دیوار بردارد.
          </p>
        </TourBox>
      );
    case 8:
      return (
        <TourBox {...common} target="[data-tour='give-send']" focus="target" title="بفرستید">
          <p>همه چیز آماده است. این قدردانی واقعی است و به دست {name} می‌رسد.</p>
        </TourBox>
      );
    case 9: {
      const minutes = Math.round(wallet.undoMs / 60_000);
      const back = lastSent?.withdrawn;
      const onPage = lastSent && given.some((g) => g.id === lastSent.id);
      return (
        <TourBox
          {...common}
          target={back || !onPage ? "[data-tour='wallet']" : "[data-tour='sent-card']"}
          title={back ? 'پس گرفتید، اشکالی ندارد' : `تا ${fa(minutes)} دقیقه برمی‌گردد`}
          actions={next(10, 'فهمیدم')}
        >
          {back ? (
            <p>سکه‌ها به کیفتان برگشت. هر وقت آماده بودید دوباره بفرستید.</p>
          ) : (
            <p>
              اگر اشتباهی شد، تا {fa(minutes)} دقیقه می‌توانید این قدردانی را با «پس گرفتن» برگردانید. بعد از آن قطعی می‌شود. {name} اول آن را مُهرشده می‌بیند و خودش مهرش را می‌شکند.
            </p>
          )}
        </TourBox>
      );
    }
    case 10:
      return (
        <TourBox {...common} target="[data-tour='wall']" title="دیوار سپاس" actions={next(firstOnWall ? 11 : MAIN_TOUR_LAST_STEP)}>
          {wall.loaded && wall.items.length === 0 ? (
            <p>دیوار هنوز خالی است. اولین کارت‌ها به‌زودی اینجا می‌آیند، شاید هم کارت شما.</p>
          ) : (
            <p>قدردانی‌های عمومی همه اینجاست، بی‌آنکه مقدارشان پیدا باشد. با فیلترها می‌توانید قدردانی‌های یک ارزش یا یک واحد را ببینید.</p>
          )}
        </TourBox>
      );
    case 11:
      return (
        <TourBox {...common} target="[data-tour='wall-card']" title="شما هم همراه شوید" actions={next(MAIN_TOUR_LAST_STEP, 'فهمیدم')}>
          <p>
            شما هم شاهد همین کار خوب بوده‌اید؟ «من هم» بزنید تا {fa(wallet.joinAmount)} سکه از طرف شما هم اضافه شود؛ روی هر کارت فقط یک بار. با واکنش‌ها هم می‌توانید همراهی کنید و این کار
            سکه‌ای خرج نمی‌کند.
          </p>
        </TourBox>
      );
    default: {
      // Sent during this tour (one sent before it, or taken back at step 9, does not count).
      const sent = Boolean(lastSent && !lastSent.withdrawn);
      return (
        <TourBox
          fx={fx}
          stepKey="main-end"
          title={sent ? 'اولین قدردانی شما رفت!' : 'آموزش تمام شد!'}
          onEscape={() => endTour('done')}
          actions={
            <button type="button" className={tourPrimary} data-tour-primary onClick={() => endTour('done')}>
              تمام
            </button>
          }
        >
          <p>از این به بعد هر وقت کار خوبی دیدید، همین چند قدم کافی است. بقیهٔ کارها را در «مأموریت‌های سپاس» می‌بینید. این آموزش را هر وقت خواستید از دکمهٔ «؟» دوباره ببینید.</p>
        </TourBox>
      );
    }
  }
};
