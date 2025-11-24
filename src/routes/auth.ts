import { Router } from 'express';
import { register, login, updateUser, deleteUser, logout } from '../controllers/authController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.put('/user/:id', updateUser);
router.delete('/user/:id', deleteUser);
router.post('/logout', logout);

export default router;
