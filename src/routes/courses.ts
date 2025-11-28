import { Router } from 'express';
import {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCoursesForPlaceToday,
  getCoursesNow,
  getCoursesByInstructor
} from '../controllers/coursesController';
import { requireAdminAuth, requireAuth} from '../middleware/jwtAuth';



const router = Router();

router.get('/', requireAuth, listCourses);
router.get('/now', requireAuth, getCoursesNow);
router.get('/:id', requireAuth, getCourseById);
router.get('/place/:placeId/today', requireAuth, getCoursesForPlaceToday);
router.get('/instructor/:instructorId', requireAuth, getCoursesByInstructor);

// Routes admin (à mettre dans adminRoutes)
router.post('/', requireAdminAuth, createCourse);
router.put('/:id', requireAdminAuth, updateCourse);
router.delete('/:id', requireAdminAuth, deleteCourse);





export default router;