import { Router } from 'express';
import { registerDevice, startSession, endSession, postLocation, streamLocations } from '../controllers/devicesController';
import { requireAuth } from '../middleware/jwtAuth';

const router = Router();

router.post('/register', registerDevice);
router.post('/session', startSession);
router.post('/session/:sessionId/end', endSession);

// Real-time location updates 
router.post('/location', requireAuth, postLocation);
// SSE stream to receive updates for a deviceId
router.get('/stream/:deviceId', requireAuth, streamLocations);

export default router;
