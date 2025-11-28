import { Router } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';


const router = Router();

router.get('/', (req, res) => {
  const dbStatus = {
    sqlite: sqliteDataSource.isInitialized ? 'Connected' : 'Disconnected',
    postgresql: pgDataSource?.isInitialized ? 'Connected' : 'Not configured'
  };
  
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    databases: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});



export default router;