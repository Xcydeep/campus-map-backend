import { Router } from 'express';
import { searchPlaces, autocompletePlaces } from '../controllers/searchController';

const router = Router();

router.get('/places', searchPlaces);
router.get('/autocomplete', autocompletePlaces);

export default router;
