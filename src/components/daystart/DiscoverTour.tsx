import React, { useEffect, useRef } from 'react';
import { usePortal } from '../../context/PortalContext';
import { useEffectsLevel } from '../thanks/effects';
import { TourBox, tourPrimary, tourSecondary } from '../thanks/tour/TourBox';
import { DISCOVER_INFO, DISCOVER_TOURS, type DiscoverPart } from '../../../shared/discover';
import { moveDiscoverTour, useDiscoverTour } from './discoverStore';

/**
 * The short tour of «کشف پرتال» on the part's own page: three steps, the first two lighting up what
 * they talk about (`data-discover` on that page), or a box in the middle where it is not on screen.
 * Leaving the page ends it, and so do Escape and «رد شدن از آموزش».
 */
export const DiscoverTour: React.FC<{ part: DiscoverPart; step: number }> = ({ part, step }) => {
  const { activeTab } = usePortal();
  const fx = useEffectsLevel();
  const steps = DISCOVER_TOURS[part];
  const tab = DISCOVER_INFO[part].tab;
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const end = () => moveDiscoverTour(null);

  // The page is switched as the tour starts; once on it, going somewhere else ends the tour.
  const reached = useRef(false);
  useEffect(() => {
    if (activeTab === tab) reached.current = true;
    else if (reached.current) moveDiscoverTour(null);
  }, [activeTab, tab]);

  return (
    <TourBox
      target={current.target ? `[data-discover="${current.target}"]` : null}
      title={current.title}
      fx={fx}
      stepKey={`discover-${part}-${step}`}
      progress={{ step: step + 1, of: steps.length }}
      onSkip={last ? undefined : end}
      onEscape={end}
      actions={
        <>
          {step > 0 && (
            <button type="button" onClick={() => moveDiscoverTour(step - 1)} className={tourSecondary}>
              قبلی
            </button>
          )}
          <button type="button" data-tour-primary onClick={() => (last ? end() : moveDiscoverTour(step + 1))} className={tourPrimary}>
            {last ? 'فهمیدم' : 'بعدی'}
          </button>
        </>
      }
    >
      <p>{current.text}</p>
    </TourBox>
  );
};

/** Mounted once for a signed-in colleague: the tour of «کشف پرتال», while one is on. */
export const DiscoverTourHost: React.FC = () => {
  const tour = useDiscoverTour();
  return tour ? <DiscoverTour key={tour.part} part={tour.part} step={tour.step} /> : null;
};
