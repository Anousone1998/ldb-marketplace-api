import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDataSourceOptions({
          url: config.get('DATABASE_URL', { infer: true }),
          ssl: config.get('DB_SSL', { infer: true }),
          poolMax: config.get('DB_POOL_MAX', { infer: true }),
          synchronize: config.get('DB_SYNCHRONIZE', { infer: true }),
          migrationsRun: config.get('DB_MIGRATIONS_RUN', { infer: true }),
          logging: config.get('DB_LOGGING', { infer: true }),
        }),
    }),
  ],
})
export class DatabaseModule {}
