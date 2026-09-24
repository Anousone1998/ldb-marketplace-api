import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  size: number = 20;
}

export interface PageMeta {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

/**
 * A list result with metadata. The response interceptor unwraps it into
 * `{ data: [...], meta: {...} }` at the top level of the envelope.
 */
export class PaginatedResult<T, M extends object = PageMeta> {
  constructor(
    readonly data: T[],
    readonly meta: M,
  ) {}
}

export function paginate<T>(data: T[], total: number, page: number, size: number): PaginatedResult<T> {
  return new PaginatedResult(data, {
    page,
    size,
    total,
    totalPages: Math.ceil(total / size),
  });
}
