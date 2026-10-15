/**
 * Shared dark-source policy for the optimizer, kernel, and preservation helpers.
 *
 * A high dark-pixel ratio alone does not prove that a mixed-polarity page is a
 * dark slide. Auto inversion is allowed for an explicit DARK_SLIDE
 * classification, a detected dark frame, or a high dark ratio corroborated by
 * light-on-dark foreground polarity. Keep this policy in one place so a page
 * cannot be considered light by the engine but dark by a pixel kernel.
 */
import { DARK_BG_RATIO_THRESHOLD } from './constants';

export interface DarkSourceProfileSignals {
  classification: string;
  darkBackgroundRatio?: number;
  darkFrame?: boolean;
  foregroundPolarity?: 'light-on-dark' | 'dark-on-light' | 'mixed';
}

export function isDarkSourceProfile(profile: DarkSourceProfileSignals): boolean {
  if (profile.classification === 'DARK_SLIDE') return true;
  if (profile.darkFrame === true) return true;

  return (
    (profile.darkBackgroundRatio ?? 0) > DARK_BG_RATIO_THRESHOLD &&
    profile.foregroundPolarity === 'light-on-dark'
  );
}
