import { Router } from 'express';
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  schedulesNow,
  getScheduleById
} from '../controllers/schedulesController';
import { requireAdminAuth, requireAuth } from '../middleware/jwtAuth';

const router = Router();


router.get('/', requireAuth, listSchedules);
router.post('/', requireAdminAuth, createSchedule);
router.get('/now', requireAuth, schedulesNow);
router.get('/:id', requireAuth, getScheduleById);
router.put('/:id', requireAdminAuth, updateSchedule);
router.delete('/:id', requireAdminAuth, deleteSchedule);

export default router;
