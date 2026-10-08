import { CHIP_TONE } from '@/shared/constants/record-fields.constants.js';

/** A manufacturer's colour (MD9) — the six the design's swatch row offers, in its order. */
export const MANUFACTURER_TONE_VALUES = [
  CHIP_TONE.LAVENDER,
  CHIP_TONE.SKY,
  CHIP_TONE.BUTTER,
  CHIP_TONE.BLUSH,
  CHIP_TONE.SAGE,
  CHIP_TONE.MINT,
] as const;

/** A manufacturer's colour. */
export type ManufacturerTone = (typeof MANUFACTURER_TONE_VALUES)[number];

/** The longest manufacturer name ("ALVI"). */
export const MANUFACTURER_NAME_MAX = 80;

/** Most suppliers or MRs one save links to a manufacturer (MD9). */
export const MANUFACTURER_LINKS_MAX = 50;
