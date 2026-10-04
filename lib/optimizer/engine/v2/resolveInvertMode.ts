/**
 * Per-page inversion policy — single source of truth.
 *
 * 'smart' is an AUTO mode: only dark-SOURCE pages invert. LIGHT_SLIDE and
 * MIXED pages keep their original polarity (a global 'smart' must never
 * re-enable inversion there — that is what turned white pages and sticky
 * notes into solid black ink). 'none' and 'simple' are literal user
 * intent and pass through untouched.
 *
 * "Dark source" is deliberately broader than classification === DARK_SLIDE.
 * The analyzer ranks DIAGRAM_EQUATION above DARK_SLIDE, so a dark lecture
 * slide that carries a table, a textbook panel or a coloured header band was
 * labelled DIAGRAM_EQUATION and its 'smart' request was silently downgraded
 * to 'none'. processPage still treated the very same page as dark
 * (darkBackgroundRatio / darkFrame), so it ran the luminance gate with no
 * colour classifier: every bright pixel (orange header, white panel, photo)
 * became solid black ink. Both sides must agree on what "dark" means.
 */
import type { PageClassification, PageProfile, ProcessingParameters } from '../../types';
import { DARK_BG_RATIO_THRESHOLD } from '../../../kernels/constants';

export type InvertMode = ProcessingParameters['invertMode'];

type DarkSourceSignals = Pick<PageProfile, 'darkBackgroundRatio' | 'darkFrame' | 'foregroundPolarity'>;

/** True when the page is light-on-dark regardless of its diagram/table label. */
export function isDarkSourcePage(
  classification: PageClassification,
  profile?: Partial<DarkSourceSignals>,
): boolean {
  if (classification === 'DARK_SLIDE') return true;
  if (!profile) return false;
  if (profile.darkFrame === true) return true;
  return (
    (profile.darkBackgroundRatio ?? 0) > DARK_BG_RATIO_THRESHOLD &&
    profile.foregroundPolarity === 'light-on-dark'
  );
}

export function resolveEffectiveInvertMode(
  requested: InvertMode,
  classification: PageClassification,
  profile?: Partial<DarkSourceSignals>,
): InvertMode {
  if (requested === 'smart' && !isDarkSourcePage(classification, profile)) return 'none';
  return requested;
}
