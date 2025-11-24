import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Signalement } from '../models/Signalement';
import fs from 'fs';

export async function createSignalement(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Signalement);
    const sqliteRepo = sqliteDataSource.getRepository(Signalement);
    const { placeId, message } = req.body;
    const photos: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const f of req.files as any[]) photos.push(f.path);
    }
    const s = pgRepo.create({ place: placeId ? ({ id: placeId } as any) : undefined, message, photos, status: 'pending' });
    const savedPg = await pgRepo.save(s);

    const sqliteS = sqliteRepo.create({ place: placeId ? ({ id: placeId } as any) : undefined, message, photos, status: 'pending' });
    await sqliteRepo.save(sqliteS);

    res.status(201).json(savedPg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create signalement', error: err });
  }
}

export async function listPending(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Signalement);
    const list = await pgRepo.find({ where: { status: 'pending' } as any });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch pending signalements', error: err });
  }
}

export async function processSignalement(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Signalement);
    const sqliteRepo = sqliteDataSource.getRepository(Signalement);
    const { id } = req.params;
    const { action } = req.body; // accept | reject
    const item = await pgRepo.findOne({ where: { id } as any });
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (action === 'accept') item.status = 'accepted';
    else if (action === 'reject') item.status = 'rejected';
    else return res.status(400).json({ message: 'invalid action' });
    await pgRepo.save(item);

    const sqliteItem = await sqliteRepo.findOne({ where: { id } as any });
    if (sqliteItem) {
      if (action === 'accept') sqliteItem.status = 'accepted';
      else if (action === 'reject') sqliteItem.status = 'rejected';
      await sqliteRepo.save(sqliteItem);
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Failed to process signalement', error: err });
  }
}
