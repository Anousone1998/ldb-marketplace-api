import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { OrderStatus } from '../../common/enums';

export class ListOrdersQueryDto extends PaginationQueryDto {
  /** buyer = my purchases, seller = orders on my items. Omit for both. */
  @IsOptional()
  @IsIn(['buyer', 'seller'])
  role?: 'buyer' | 'seller';

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
