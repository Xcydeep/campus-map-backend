import { Router } from 'express';
import { 
  listCategories, 
  createCategory, 
  updateCategory, 
  deleteCategory 
} from '../controllers/categoriesController';
import { requireAdminAuth } from '../middleware/jwtAuth';

const router = Router();

// Route publique
router.get('/', listCategories);

// Routes protégées (à ajouter dans adminRoutes)
router.post('/', requireAdminAuth, createCategory);
router.put('/:id', requireAdminAuth, updateCategory);
router.delete('/:id', requireAdminAuth, deleteCategory);

export default router;