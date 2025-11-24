import { Router } from 'express';
import multer from 'multer';
import { createSignalement, listPending, processSignalement } from '../controllers/signalementController';
import { requireAdminAuth } from '../middleware/jwtAuth';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.array('photos', 6), createSignalement);

// admin
router.get('/admin/pending', requireAdminAuth, listPending);
router.post('/admin/:id/process', requireAdminAuth, processSignalement);

export default router;
