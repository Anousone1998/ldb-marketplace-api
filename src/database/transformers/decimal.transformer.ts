import { ValueTransformer } from 'typeorm';

/** node-postgres returns NUMERIC as string; expose it as a JS number (safe for numeric(12,2)). */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
