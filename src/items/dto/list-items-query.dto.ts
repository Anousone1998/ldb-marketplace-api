import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ItemStatus, ItemType } from '../../common/enums';
import { Trim } from '../../common/transformers/trim.transformer';

export class ListItemsQueryDto extends PaginationQueryDto {
  /** Case-insensitive search on title and description. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  /** When omitted, AVAILABLE and RESERVED items are returned (SOLD items are hidden). */
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,50}$/)
  sellerId?: string;
}
