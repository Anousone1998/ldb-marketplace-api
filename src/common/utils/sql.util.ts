import { QueryFailedError } from 'typeorm';

/** Postgres SQLSTATE codes handled explicitly by the application. */
export const PgErrorCode = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  LOCK_NOT_AVAILABLE: '55P03',
  DEADLOCK_DETECTED: '40P01',
  SERIALIZATION_FAILURE: '40001',
} as const;

export function getPgErrorCode(error: unknown): string | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const driverError = error.driverError as { code?: unknown } | undefined;
  return typeof driverError?.code === 'string' ? driverError.code : undefined;
}

export function isPgError(error: unknown, code: string): boolean {
  return getPgErrorCode(error) === code;
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
