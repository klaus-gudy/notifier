/** Drops spaces, dashes, brackets and a leading + so numbers store consistently. */
export const stripPhoneFormatting = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;
