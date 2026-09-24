import { Transform } from 'class-transformer';

/** Trims string input; leaves other types untouched so validators can reject them. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
