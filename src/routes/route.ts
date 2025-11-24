import { Router } from 'express';
import { getRoute } from '../controllers/routeController';
import { getMapboxRoute } from '../controllers/mapboxController';

const router = Router();

router.get('/', getRoute);
router.get('/mapbox', getMapboxRoute);

export default router;
