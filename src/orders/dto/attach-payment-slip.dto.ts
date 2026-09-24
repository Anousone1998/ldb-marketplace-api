import { IsUrl } from 'class-validator';

export class AttachPaymentSlipDto {
  /** Public URL returned by POST /api/v1/storage/image?folder=payment-slips */
  @IsUrl({ protocols: ['https', 'http'], require_tld: false })
  paymentSlipUrl: string;
}
