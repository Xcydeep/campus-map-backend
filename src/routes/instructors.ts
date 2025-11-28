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
import { requireAdminAuth, requireAuth} from '../middleware/jwtAuth';

const router = Router();

// Routes CRUD de base
router.get('/', requireAuth, listInstructors);
router.get('/:id', requireAuth, getInstructorById);
router.get('/search/:name', requireAuth, getInstructorByName);
router.post('/', requireAdminAuth, createInstructor);
router.put('/:id', requireAdminAuth, updateInstructor);
router.patch('/:id', requireAdminAuth, patchInstructor);
router.delete('/:id', requireAdminAuth, deleteInstructor);

// Routes pour les relations
router.get('/:id/courses', requireAuth, getInstructorCourses);
router.get('/:id/office', requireAuth, getInstructorOffice);

export default router;