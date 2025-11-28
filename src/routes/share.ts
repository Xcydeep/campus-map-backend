import { Router } from 'express';
import { viewShare, createShare } from '../controllers/shareController'; // UN SEUL IMPORT
import { requireAuth } from '../middleware/jwtAuth';

const router = Router();


router.get('/:token', viewShare); 

router.post('/', requireAuth, createShare);

export default router;