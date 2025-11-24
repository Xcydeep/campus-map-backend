// Dans routes/courses.ts
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

const router = Router();

router.get('/', listCourses);
router.get('/now', getCoursesNow);
router.get('/:id', getCourseById);
router.get('/place/:placeId/today', getCoursesForPlaceToday);
router.get('/instructor/:instructorId', getCoursesByInstructor);

// Routes admin (à mettre dans adminRoutes)
router.post('/', createCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

export default router;