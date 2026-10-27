/**
 * True on a phone or tablet. There a text field that takes the focus by itself pops the keyboard
 * up over half of the screen before the colleague has seen the page, so only a mouse gets it.
 */
export const isTouchScreen = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
