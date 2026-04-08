import 'dotenv/config';
import { AppDataSource } from './database/typeorm.config';

void AppDataSource.initialize()
  .then((ds) => ds.runMigrations())
  .then(() => {
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
