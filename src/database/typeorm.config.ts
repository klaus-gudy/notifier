import { DataSourceOptions } from 'typeorm';

export interface DatabaseSettings {
  url: string;
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
): DataSourceOptions => {
  const shared = {
    type: 'postgres' as const,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    // Schema changes go through migrations only — this table is an audit log.
    synchronize: false,
    migrationsRun: true,
  };

  // A connection string wins when set. The discrete fields stay as the
  // fallback so existing environments keep working untouched.
  return db.url
    ? { ...shared, url: db.url }
    : {
        ...shared,
        host: db.host,
        port: db.port,
        username: db.username,
        password: db.password || undefined,
        database: db.name,
      };
};
