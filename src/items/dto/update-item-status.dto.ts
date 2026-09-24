import { IsEnum } from 'class-validator';
import { ItemStatus } from '../../common/enums';

export class UpdateItemStatusDto {
  @IsEnum(ItemStatus)
  status: ItemStatus;
}
