import { IsEnum, IsOptional } from 'class-validator';
import { StorageFolder } from '../storage.constants';

export class UploadQueryDto {
  @IsOptional()
  @IsEnum(StorageFolder)
  folder: StorageFolder = StorageFolder.ITEMS;
}
