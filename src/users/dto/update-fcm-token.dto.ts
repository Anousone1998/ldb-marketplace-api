import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/transformers/trim.transformer';

export class UpdateFcmTokenDto {
  /** Registration token from Firebase Messaging `getToken()` on the device. */
  @Trim()
  @IsString()
  @Length(20, 4096)
  fcmToken: string;
}
