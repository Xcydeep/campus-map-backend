import { Router } from 'express';
import {
  listInstructors,
  getInstructorById,
  getInstructorByName,
  createInstructor,
  updateInstructor,
  patchInstructor,
  deleteInstructor,
  getInstructorCourses,
  getInstructorOffice
} from '../controllers/InstructorsController';

const router = Router();

// Routes CRUD de base
router.get('/', listInstructors);
router.get('/:id', getInstructorById);
router.get('/search/:name', getInstructorByName);
router.post('/', createInstructor);
router.put('/:id', updateInstructor);
router.patch('/:id', patchInstructor);
router.delete('/:id', deleteInstructor);

// Routes pour les relations
router.get('/:id/courses', getInstructorCourses);
router.get('/:id/office', getInstructorOffice);

export default router;