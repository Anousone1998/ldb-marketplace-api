import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class LoginDto {
  /** Case-insensitive: " emp00101 " → "EMP00101". */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,50}$/, { message: 'userId must be a valid employee ID (e.g. EMP00101)' })
  userId: string;

  /** Must match the number stored for the employee; spaces, dashes, brackets and "+" are ignored. */
  @IsString()
  @Matches(/^\+?[0-9\s()-]{6,25}$/, { message: 'phoneNumber must be a valid phone number' })
  phoneNumber: string;
}
