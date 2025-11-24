import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import placesRouter from './routes/places';
import healthRouter from './routes/health';
import adminRouter from './routes/admin';
import coursesRouter from './routes/courses';
import schedulesRouter from './routes/schedules';
import searchRouter from './routes/search';
import authRouter from './routes/auth';
import shareRouter from './routes/share';
import devicesRouter from './routes/devices';
import routeRouter from './routes/route';
import signalementsRouter from './routes/signalements';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.use('/health', healthRouter);
  app.use('/api/places', placesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/search', searchRouter);
  // auth
  app.use('/api/auth', authRouter);
  // public share route
  app.use('/share', shareRouter);
  // devices
  app.use('/api/devices', devicesRouter);
  // routing
  app.use('/api/route', routeRouter);
  // signalements
  app.use('/api/signalements', signalementsRouter);

  app.use((req, res) => {
    // typed 404 handler
    (res as import('express').Response).status(404).json({ message: 'Not Found' });
  });

  return app;
}
