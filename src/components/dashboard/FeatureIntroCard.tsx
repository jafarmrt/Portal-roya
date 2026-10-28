import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { featureInfo } from '../../../shared/features';
import { usePortal } from '../../context/PortalContext';
import type { ActiveTab } from '../../types';

/** A one-time card for each part of the portal introduced in the last two weeks that this person has not opened yet. */
export const FeatureIntroCard: React.FC = () => {
  const { appSettings, currentUser, markFeatureSeen, setActiveTab } = usePortal();
  const fresh = currentUser ? (appSettings?.featureNews ?? []).filter((n) => n.card) : [];
  if (fresh.length === 0) return null;

  return (
    <div className="space-y-3">
      {fresh.map(({ key }) => {
        const info = featureInfo(key);
        const tab = info.tabs[0] as ActiveTab | undefined;
        return (
          <section key={key} className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 sm:p-5 flex items-start gap-3" aria-label={`تازه در پرتال: ${info.label}`}>
            <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-sm font-black text-emerald-950">تازه در پرتال: {info.label}</h2>
              <p className="text-xs text-emerald-900 leading-relaxed">{info.hint}</p>
              {tab && (
                <button
                  type="button"
                  onClick={() => {
                    markFeatureSeen(key);
                    setActiveTab(tab);
                  }}
                  className="mt-1 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
                >
                  ببینم
                </button>
              )}
            </div>
            <button type="button" onClick={() => markFeatureSeen(key)} aria-label="بستن معرفی" className="p-1.5 rounded-lg text-emerald-900 hover:bg-emerald-100 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </section>
        );
      })}
    </div>
  );
};
