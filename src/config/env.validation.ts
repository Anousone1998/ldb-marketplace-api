import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { parseBool, parseIntOr } from './env.helpers';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const toInt =
  (fallback: number) =>
  ({ value }: { value: unknown }) =>
    parseIntOr(value, fallback);

const toBool =
  (fallback: boolean) =>
  ({ value }: { value: unknown }) =>
    parseBool(value, fallback);

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toInt(3000))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  CORS_ORIGINS: string = '*';

  /** Express "trust proxy": false, true, a hop count, or a subnet list (e.g. "loopback, 10.0.0.0/8"). */
  @IsString()
  TRUST_PROXY: string = 'false';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @Transform(toBool(true))
  @IsBoolean()
  DB_SSL: boolean = true;

  @Transform(toInt(10))
  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_MAX: number = 10;

  @Transform(toBool(true))
  @IsBoolean()
  DB_MIGRATIONS_RUN: boolean = true;

  @Transform(toBool(false))
  @IsBoolean()
  DB_SYNCHRONIZE: boolean = false;

  @Transform(toBool(false))
  @IsBoolean()
  DB_LOGGING: boolean = false;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  SUPABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_BUCKET_NAME: string = 'marketplace';

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  JWT_SECRET: string;

  @Transform(toInt(28800))
  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN: number = 28800;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  JWT_ISSUER?: string;

  /** Path to the Firebase service account JSON, used for FCM push only. */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_PATH?: string;

  /** Alternative to the path: the service account JSON inline (e.g. for Docker/hosting env vars). */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, { skipMissingProperties: false });

  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  if (validated.NODE_ENV === NodeEnv.Production && validated.DB_SYNCHRONIZE) {
    messages.push('DB_SYNCHRONIZE must be false when NODE_ENV=production');
  }

  if (messages.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${messages.join('\n  - ')}`);
  }
  return validated;
}
