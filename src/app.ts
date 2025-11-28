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
import categoryRouter from './routes/categories';
import instructorRouter from './routes/instructors';

export function createApp() {
  const app = express();
  
  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  
  app.use('/health', healthRouter);
  
 
  app.use('/api/places', placesRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/instructors', instructorRouter); 
 
  app.use('/api/admin', adminRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/route', routeRouter);
  app.use('/api/signalements', signalementsRouter);
  
  // Public share route
  app.use('/api/share', shareRouter);

 
  app.use((req, res) => {
    res.status(404).json({ message: 'Not Found' });
  });

  return app;
}