import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { InitialSchema1758700000000 } from './migrations/1758700000000-InitialSchema';

export interface DatabaseSettings {
  url: string;
  ssl: boolean;
  poolMax: number;
  synchronize: boolean;
  migrationsRun: boolean;
  logging: boolean;
}

/** Shared by the Nest app (TypeOrmModule) and the CLI data source (migrations + seeder). */
export function buildDataSourceOptions(settings: DatabaseSettings): DataSourceOptions {
  return {
    type: 'postgres',
    url: settings.url,
    // Supabase requires TLS; its certificate chain is not in Node's default CA bundle.
    ssl: settings.ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [InitialSchema1758700000000],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: settings.migrationsRun,
    synchronize: settings.synchronize,
    logging: settings.logging ? ['query', 'error', 'warn'] : ['error', 'warn'],
    applicationName: 'corporate-marketplace-api',
    extra: {
      max: settings.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Guards against runaway queries holding pooled connections.
      statement_timeout: 15_000,
    },
  };
}
