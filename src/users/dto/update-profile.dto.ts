import { IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/transformers/trim.transformer';

/** Employees can only maintain their contact/payment info. */
export class UpdateProfileDto {
  /** Also the login credential: can be changed, but not removed (null is rejected). */
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9\s()-]{6,25}$/, { message: 'phoneNumber must be a valid phone number' })
  @MaxLength(25)
  phoneNumber?: string;

  /** Public URL returned by POST /api/v1/storage/images?folder=qr-codes */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ['https', 'http'], require_tld: false })
  qrPaymentUrl?: string | null;
}
