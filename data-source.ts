import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// Entities
import { Place } from './src/models/Place';
import { Category } from './src/models/Category';
import { Room } from './src/models/Room';
import { Course } from './src/models/Course';
import { User } from './src/models/User';
import { Device } from './src/models/Device';
import { Session } from './src/models/Session';
import { Position } from './src/models/Position';
import { Edge } from './src/models/Edge';
import { Instructor } from './src/models/Instructor';
import { Schedule } from './src/models/Schedule';
import { Signalement } from './src/models/Signalement';

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.warn('DATA SOURCE: DATABASE_URL not set; data-source expects a Postgres URL when running migrations');
}

const dataSource = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [Place, Category, Room, Course, User, Device, Session, Position, Edge, Instructor, Schedule, Signalement],
  // support running migrations from TS during development and from compiled JS in production
  migrations: [path.join(__dirname, 'migrations', '*.js'), path.join(process.cwd(), 'src', 'migrations', '*.ts')],
});

export default dataSource;
