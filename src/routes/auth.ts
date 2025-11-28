import { Router } from 'express';
import {
  register,
  login,
  logout,
  updateUser,
  deleteUser,
  getUsers,
  getUserById,
  getCurrentUser
} from '../controllers/authController';
import { requireAdminAuth } from '../middleware/jwtAuth';
import { requireAuth } from '../middleware/jwtAuth';

const router = Router();

// Public routes (no authentication required)
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected routes (authentication required)
router.get('/user/me', requireAuth, getCurrentUser);
router.get('/user/:id', requireAuth, getUserById);
router.put('/user/:id', requireAuth, updateUser);

// Admin only routes (admin authentication required)
router.get('/users', requireAdminAuth, getUsers);
router.delete('/user/:id', requireAdminAuth, deleteUser);

export default router;