import { WISH_REACTIONS } from './celebrations.js';

/**
 * Emoji reactions from colleagues: to a new colleague's introduction ('intro'), to a welcome message
 * under it ('welcome', given by the new colleague) and to a greeting card that is not private
 * ('greeting', by anyone but the person it is for, who keeps their own one reaction on the card).
 */
export const REACTION_TARGETS = ['intro', 'welcome', 'greeting'] as const;
export type ReactionTarget = (typeof REACTION_TARGETS)[number];

/** The same five emoji as a greeting card's own reaction. */
export const REACTION_EMOJIS = WISH_REACTIONS;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** One emoji under something: how many gave it, whether the viewer did, and who (empty for guests). */
export interface ReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}
