import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemType } from '../../common/enums';
import { Trim } from '../../common/transformers/trim.transformer';
import { MAX_IMAGES_PER_UPLOAD } from '../../storage/storage.constants';

export class CreateItemDto {
  @Trim()
  @IsString()
  @Length(3, 200)
  title: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Required (> 0) for SECOND_HAND, FOOD and HOUSEHOLD; must be omitted or 0 for FREE. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9_999_999_999.99)
  price?: number;

  /** Units in stock (default 1). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @IsEnum(ItemType)
  itemType: ItemType;

  @Trim()
  @IsString()
  @Length(2, 150)
  pickupLocation: string;

  /** Public URLs returned by POST /api/v1/storage/images */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_UPLOAD)
  @IsUrl({ protocols: ['https', 'http'], require_tld: false }, { each: true })
  images?: string[];
}
