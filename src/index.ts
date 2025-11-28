import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { connectDatabases } from './loaders/database';

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    // Connexion aux bases de données
    await connectDatabases();

    // Création de l'application Express
    const app = createApp();

    app.listen(PORT, () => {
      console.log(`MapDang backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

main();
