import { Router } from 'express';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoriesController';

const router = Router();

router.get('/', listCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
