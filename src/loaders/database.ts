import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

// Import des entités
import { Place } from '../models/Place';
import { PlaceLite } from '../models/PlaceLite';
import { Category } from '../models/Category';
import { CategoryLite } from '../models/CategoryLite'; // Nouveau
import { Course } from '../models/Course';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Session } from '../models/Session';
import { Position } from '../models/Position';
import { Edge } from '../models/Edge';
import { Instructor } from '../models/Instructor';
import { Schedule } from '../models/Schedule';
import { Signalement } from '../models/Signalement';

const DATABASE_URL = process.env.DATABASE_URL;

function ensureDataDir() {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

// Configuration SQLite (SEULEMENT entités légères)
const sqliteConfig = {
  type: 'sqlite' as const,
  database: path.join(ensureDataDir(), 'mapdang.sqlite'),
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [PlaceLite, CategoryLite], // SEULEMENT entités légères
};

// Configuration PostgreSQL (toutes les entités)
let pgDataSource: DataSource | null = null;

if (DATABASE_URL && typeof DATABASE_URL === 'string' && DATABASE_URL.trim() !== '') {
  const postgresConfig = {
    type: 'postgres' as const,
    url: DATABASE_URL,
    synchronize: process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',
    entities: [
      Place, 
      Category,     // Category complète pour PostgreSQL
      CategoryLite, // CategoryLite aussi pour PostgreSQL (optionnel)
      Course, 
      User, 
      Device, 
      Session, 
      Position, 
      Edge, 
      Instructor, 
      Schedule, 
      Signalement,
      PlaceLite
    ],
  };
  pgDataSource = new DataSource(postgresConfig);
} else {
  console.warn('Warning: DATABASE_URL environment variable is not set or invalid. PostgreSQL initialization will be skipped.');
}

const sqliteDataSource = new DataSource(sqliteConfig);

// Fonction pour connecter les bases de données
export async function connectDatabases() {
  try {
    const initPromises = [sqliteDataSource.initialize()];
    
    if (pgDataSource) {
      initPromises.push(pgDataSource.initialize());
    } else {
      console.log('PostgreSQL DataSource not initialized due to missing DATABASE_URL');
    }
    
    await Promise.all(initPromises);
    console.log('✅ SQLite Database connected (PlaceLite & CategoryLite only)');
    if (pgDataSource?.isInitialized) {
      console.log('✅ PostgreSQL Database connected (all entities)');
    }
  } catch (err) {
    console.error('❌ Failed to initialize databases', err);
    throw err;
  }
}

export { pgDataSource, sqliteDataSource };