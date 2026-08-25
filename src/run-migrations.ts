import 'dotenv/config';
import { AppDataSource } from './database/typeorm.config';

void AppDataSource.initialize()
  .then(async (ds) => {
    const ran = await ds.runMigrations();
    if (!ran.length) {
      console.log('Migrations: nothing pending');
    } else {
      for (const m of ran) {
        console.log(`Migration OK: ${m.name}`);
      }
    }
    await ds.destroy();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
