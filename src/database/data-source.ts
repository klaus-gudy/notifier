import 'dotenv/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { buildDataSourceOptions } from './typeorm.config';

/** Entry point for the TypeORM CLI (`npm run migration:*`). */
export default new DataSource(buildDataSourceOptions(configuration().database));
