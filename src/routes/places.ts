import { Router } from 'express';
import multer from 'multer';
import { 
  getPlaces, 
  getPlaceById, 
  createPlace, 
  updatePlace, 
  deletePlace, 
  uploadPlacePhotos,
  getClassrooms,
  getOffices,
  getOfficeByInstructor
} from '../controllers/placesController';
import { requireAdminAuth, requireAuth} from '../middleware/jwtAuth';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Routes publiques
router.get('/', requireAuth, getPlaces);
router.get('/:id', requireAuth, getPlaceById);
router.get('/type/classrooms', requireAuth, getClassrooms);
router.get('/type/offices', requireAuth, getOffices);
router.get('/office/instructor/:instructorName', requireAuth, getOfficeByInstructor);

// Routes protégées (à ajouter dans adminRoutes)
router.post('/', requireAdminAuth, createPlace);
router.put('/:id', requireAdminAuth, updatePlace);
router.delete('/:id', requireAdminAuth, deletePlace);
router.post('/:id/photos', upload.array('photos', 6), requireAdminAuth, uploadPlacePhotos);

export default router;