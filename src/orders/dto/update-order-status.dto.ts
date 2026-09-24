import { IsIn } from 'class-validator';
import { OrderStatus } from '../../common/enums';

export class UpdateOrderStatusDto {
  @IsIn([OrderStatus.COMPLETED, OrderStatus.CANCELLED], {
    message: 'status must be one of: COMPLETED, CANCELLED',
  })
  status: OrderStatus.COMPLETED | OrderStatus.CANCELLED;
}
