import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

import { connectDatabases } from './loaders/database';

const port = process.env.PORT || 4000;

async function main() {
  const app = createApp();
  await connectDatabases();
  app.listen(port, () => {
    console.log(`MapDang backend running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error', err);
  process.exit(1);
});
