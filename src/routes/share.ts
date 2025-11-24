import { Router } from 'express';
import { viewShare } from '../controllers/shareController';

const router = Router();

router.get('/:token', viewShare);

export default router;
