import { Router } from 'express';
import multer from 'multer';
import { getPlaces, createPlace, getPlaceById, updatePlace, deletePlace, uploadPlacePhotos } from '../controllers/placesController';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', getPlaces);
router.post('/', createPlace);
router.get('/:id', getPlaceById);
router.put('/:id', updatePlace);
router.delete('/:id', deletePlace);

export default router;
