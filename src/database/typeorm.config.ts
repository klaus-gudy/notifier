import { DataSourceOptions } from 'typeorm';

export interface DatabaseSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

/**
 * Single source of truth for connection options, shared by the Nest runtime and
 * the TypeORM CLI so migrations always run against the same schema definition.
 */
export const buildDataSourceOptions = (
  db: DatabaseSettings,
): DataSourceOptions => ({
  type: 'postgres',
  host: db.host,
  port: db.port,
  username: db.username,
  password: db.password || undefined,
  database: db.name,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  // Schema changes go through migrations only — this table is an audit log.
  synchronize: false,
  migrationsRun: true,
});
