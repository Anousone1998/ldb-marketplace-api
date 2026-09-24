import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { parseBool, parseIntOr } from '../config/env.helpers';
import { buildDataSourceOptions } from './typeorm.config';

loadEnv();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in your Supabase connection string.');
}

/** Standalone data source used by the TypeORM CLI and the seeder. */
export const AppDataSource = new DataSource(
  buildDataSourceOptions({
    url: process.env.DATABASE_URL,
    ssl: parseBool(process.env.DB_SSL, true),
    poolMax: parseIntOr(process.env.DB_POOL_MAX, 5),
    synchronize: false,
    migrationsRun: false,
    logging: parseBool(process.env.DB_LOGGING, false),
  }),
);
