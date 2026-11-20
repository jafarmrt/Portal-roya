import React, { useEffect, useRef } from 'react';
import type { EffectsLevel } from '../effects';
import { showThanksTab, useThanks } from '../thanksStore';
import { TourBox, tourPrimary, tourSecondary } from './TourBox';
import { askSkip, endTour, goToStep, useTour } from './tourStore';

// The short tour of the first recognition received (plan: ب۱). It starts when one waits sealed; from
// the «؟» menu, without one, the same words come without a card to point at.

export const ReceivedTour: React.FC<{ fx: EffectsLevel }> = ({ fx }) => {
  const { active, askingSkip } = useTour();
  const { received, revealing } = useThanks();
  const step = active?.kind === 'received' ? active.step : -1;

  // The card the tour is about: the first sealed one when it started.
  const cardId = useRef<string | null>(null);
  const wasOpen = useRef(false);
  if (step < 0) {
    cardId.current = null;
    wasOpen.current = false;
  } else if (cardId.current === null) cardId.current = received.find((c) => c.sealed)?.id ?? '';
  const card = received.find((c) => c.id === cardId.current) ?? null;
  const live = card !== null;
  const opened = card && !card.sealed ? card : null;

  useEffect(() => {
    if (step === 0 && live) showThanksTab('received');
  }, [step, live]);

  // Opening the seal moves on; closing the envelope afterwards ends the tour (it was all seen in it).
  useEffect(() => {
    if (!live || step < 0) return;
    if (step === 0 && opened && revealing === opened.id) goToStep(1);
    if (step >= 1 && revealing) wasOpen.current = true;
    if (step >= 1 && !revealing && wasOpen.current) endTour('done');
  }, [live, step, opened, revealing]);

  if (step < 0) return null;
  const skip = () => askSkip(true);

  if (askingSkip) {
    return (
      <TourBox
        stepKey="received-skip"
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

  const isPublic = opened ? opened.isPublic : true;
  const common = { fx, stepKey: `received-${step}`, onSkip: skip, onEscape: skip, progress: { step: step + 1, of: isPublic ? 4 : 3 } };
  const next = (to: number) => (
    <button type="button" className={tourPrimary} data-tour-primary onClick={() => goToStep(to)}>
      بعدی
    </button>
  );
  const done = (
    <button type="button" className={tourPrimary} data-tour-primary onClick={() => endTour('done')}>
      فهمیدم
    </button>
  );

  switch (step) {
    case 0:
      return live ? (
        <TourBox {...common} target={["[data-tour='seal']", "[data-tour='sealed']"]} focus="target" title="یک قدردانی برایتان رسیده!">
          <p>هنوز مُهر است و فقط خودتان می‌توانید بازش کنید. مهرش را بشکنید.</p>
        </TourBox>
      ) : (
        <TourBox {...common} title="وقتی قدردانی‌ای برایتان برسد" actions={next(1)}>
          <p>قدردانی مثل یک پاکت مُهرشده در «دریافتی‌ها» می‌آید. فقط خودتان می‌توانید بازش کنید؛ تا آن وقت کسی نمی‌داند چه نوشته شده.</p>
        </TourBox>
      );
    case 1:
      return (
        <TourBox {...common} target={live ? "[data-tour='reveal-reactions']" : null} title="پیام و سکه‌ها مال شماست" actions={next(isPublic ? 2 : 3)}>
          <p>
            حالا پیام و مقدار را می‌بینید. مقدار را فقط شما و فرستنده می‌بینید. این سکه‌ها مال خودتان است و هیچ‌وقت از بین نمی‌رود. با یک واکنش نشان دهید که دیدید؛ واکنش روی کارت می‌ماند.
          </p>
        </TourBox>
      );
    case 2:
      return (
        <TourBox {...common} target={live ? "[data-tour='reveal-wall']" : null} title="روی دیوار هم هست" actions={next(3)}>
          <p>این کارت روی دیوار هم هست. اگر نمی‌خواهید آنجا باشد، از همین‌جا برش دارید. هر وقت خواستید می‌توانید برگردانید.</p>
        </TourBox>
      );
    default:
      return (
        <TourBox {...common} target={live ? "[data-tour='reveal-report']" : null} title="اگر پیامی ناراحتتان کرد" actions={done}>
          <p>
            «گزارش» بزنید. مسئول برنامه فقط همان یک پیام و یادداشت شما را می‌بیند، نه مقدار را، و فرستنده از گزارش شما باخبر نمی‌شود. اگر مسئول برنامه قدردانی را برگرداند، دلیلش را هر دو
            نفر می‌بینید.
          </p>
        </TourBox>
      );
  }
};
