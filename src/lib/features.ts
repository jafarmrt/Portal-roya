import type { AppSettings } from '../types';
import { type FeatureKey, featureOfCard, featureOfTab } from '../../shared/features';

// What the server says this person sees of the parts an administrator can switch off (see shared/features.ts).

export const featureOn = (settings: AppSettings | null, key: FeatureKey) => Boolean(settings?.features?.[key]);

/** True while only the administrator and the pilot group see it. */
export const featureInPreview = (settings: AppSettings | null, key: FeatureKey) => settings?.features?.[key] === 'preview';

/** Pages that belong to no switchable part are always shown. */
export const tabOn = (settings: AppSettings | null, tab: string) => {
  const key = featureOfTab(tab);
  return !key || featureOn(settings, key);
};

export const cardFeatureOn = (settings: AppSettings | null, card: string) => {
  const key = featureOfCard(card);
  return !key || featureOn(settings, key);
};

/** «جدید» or «پیش‌نمایش» next to a page's name in the menu. */
export function tabLabelBadge(settings: AppSettings | null, tab: string): 'new' | 'preview' | null {
  const key = featureOfTab(tab);
  if (!key) return null;
  if (featureInPreview(settings, key)) return 'preview';
  return settings?.featureNews?.some((n) => n.key === key && n.badge) ? 'new' : null;
}
