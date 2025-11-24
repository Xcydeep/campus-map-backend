import { Router, Request, Response, NextFunction } from 'express';
import { requireAdminAuth } from '../middleware/jwtAuth';
import { createCategory, updateCategory, deleteCategory } from '../controllers/categoriesController';
import { createPlace, updatePlace, deletePlace, uploadPlacePhotos } from '../controllers/placesController';
import { createCourse, updateCourse, deleteCourse} from '../controllers/coursesController';
import { createSchedule, updateSchedule, deleteSchedule} from '../controllers/schedulesController';
import multer from 'multer';
import { importPlacesCSV, importPlacesGeoJSON } from '../controllers/importController';
import { 
  exportOfflinePack, 
  exportGraphJSON, 
  exportSqlite 
} from '../controllers/exportController';
import { importEdgesCSV } from '../controllers/edgesController';
uploadPlacePhotos
const upload = multer({ dest: 'uploads/' });

const router = Router();

router.use(requireAdminAuth);

//router.use('/categories', categoriesRouter);

//router.post('/category', createCategory);
//router.put('/category/:id', updateCategory);
//router.delete('/category/:id', deleteCategory);
//router.use('/places', placesRouter);


//router.put('/place/:id', updatePlace);
//router.delete('/place/:id', deletePlace);
//router.post('/place', createPlace);
// admin-only upload for place photos
//router.post('/places/:id/photos', upload.array('photos', 6), uploadPlacePhotos) ; //async (req: Request, res: Response, next: NextFunction) => {
	// delegate to places controller handler
	//const { uploadPlacePhotos } = await import('../controllers/placesController');
	//return uploadPlacePhotos(req as any, res as any);
//});
//router.use('/rooms', roomsRouter);




//router.use('/courses', coursesRouter);

router.put('/course/:id', updateCourse);
router.delete('/course/:id', deleteCourse);
router.post('/course', createCourse);


router.put('/schedule/:id', updateSchedule);
router.delete('/schedule/:id', deleteSchedule);
router.post('/schedule', createSchedule);


router.post('/import/places/csv', upload.single('file'), importPlacesCSV);
router.post('/import/places/geojson', upload.single('file'), importPlacesGeoJSON);
router.post('/import/edges/csv', upload.single('file'), importEdgesCSV);
router.get('/export/offline', exportOfflinePack);
//router.get('/export/sqlite', exportSqlite);
//router.get('/export/graph', exportGraphJSON);

export default router;
