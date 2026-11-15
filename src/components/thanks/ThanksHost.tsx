import React, { useEffect } from 'react';
import '@fontsource/lalezar/arabic-400.css';
import './thanks.css';
import { THANKS_EVENT } from '../../context/PortalContext';
import { GiveModal } from './GiveModal';
import { RevealModal } from './RevealModal';
import { loadThanks, resetThanks, useThanks } from './thanksStore';

/**
 * Mounted once while «سپاس» is switched on for this colleague: loads the wallet and their lists, loads
 * them again whenever the server says something changed, and shows the two dialogs that can be asked
 * for from anywhere (giving a recognition, opening a sealed one).
 */
export const ThanksHost: React.FC<{ userId: string }> = ({ userId }) => {
  const { giving, revealing } = useThanks();

  useEffect(() => {
    void loadThanks();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      // Every open page hears of a change at once; a random wait spreads their requests out.
      timer = setTimeout(() => void loadThanks(), 200 + Math.random() * 700);
    };
    window.addEventListener(THANKS_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(THANKS_EVENT, onChange);
      resetThanks();
    };
  }, [userId]);

  return (
    <>
      {giving && <GiveModal key={giving.to ?? 'anyone'} to={giving.to} />}
      {revealing && <RevealModal key={revealing} id={revealing} />}
    </>
  );
};
