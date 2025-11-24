import { Router } from 'express';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, schedulesNow } from '../controllers/schedulesController';

const router = Router();

router.get('/', listSchedules);
router.post('/', createSchedule);
router.get('/now', schedulesNow);
router.put('/:id', updateSchedule);
router.delete('/:id', deleteSchedule);

export default router;
