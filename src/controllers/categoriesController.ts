import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Category } from '../models/Category';
import { badRequest, conflict, handleError, notFound } from '../utils/errorHandler';

export async function listCategories(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Category);
    const items = await pgRepo.find();
    res.json(items);
  } catch (err) {
    handleError(res, err, 'Failed to fetch categories');
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(Category);
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Category name is required and must be a string');
    }

    const existingPgCategory = await pgRepo.findOne({ where: { name } });
    if (existingPgCategory) {
      return conflict(res, 'Category already exists');
    }

    const c = pgRepo.create({ name });
    const savedPgCategory = await pgRepo.save(c);

    // Mirror in SQLite
    const sqliteCategory = sqliteRepo.create({ name });
    await sqliteRepo.save(sqliteCategory);

    res.status(201).json(savedPgCategory);
  } catch (err) {
    handleError(res, err, 'Failed to create category');
  }
}

export async function updateCategory(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(Category);

    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Category name is required and must be a string');
    }

    const pgCategory = await pgRepo.findOne({ where: { id } });
    if (!pgCategory) return notFound(res, 'Category not found in PostgreSQL');
    const sqliteCategory = await sqliteRepo.findOne({ where: { id } });
    if (!sqliteCategory) return notFound(res, 'Category not found in SQLite');

    pgRepo.merge(pgCategory, { name });
    await pgRepo.save(pgCategory);

    sqliteRepo.merge(sqliteCategory, { name });
    await sqliteRepo.save(sqliteCategory);

    res.json(pgCategory);
  } catch (err) {
    handleError(res, err, 'Failed to update category');
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(Category);

    const { id } = req.params;

    const pgCategory = await pgRepo.findOne({ where: { id } });
    if (!pgCategory) return notFound(res, 'Category not found in PostgreSQL');
    const sqliteCategory = await sqliteRepo.findOne({ where: { id } });
    if (!sqliteCategory) return notFound(res, 'Category not found in SQLite');

    await pgRepo.remove(pgCategory);
    await sqliteRepo.remove(sqliteCategory);

    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'Failed to delete category');
  }
}
