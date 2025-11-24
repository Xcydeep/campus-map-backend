import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pgDataSource } from '../loaders/database';
import { Place } from '../models/Place';

const SHARE_SECRET = process.env.SHARE_SECRET || 'dev_share_secret';

// Generate a short-lived share token (TTL in seconds)
export async function createShare(req: Request, res: Response) {
  try {
    const { placeId, ttl = 3600 } = req.body;
    if (!placeId) return res.status(400).json({ message: 'placeId required' });
    if (!pgDataSource) return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    const repo = pgDataSource.getRepository(Place);
    const place = await repo.findOne({ where: { id: placeId } as any });
    if (!place) return res.status(404).json({ message: 'place not found' });
    const payload = { id: place.id, name: place.name, lat: place.latitude, lon: place.longitude };
    const token = jwt.sign(payload, SHARE_SECRET, { expiresIn: ttl });
    const url = `/share/${token}`; // client can prepend host
    res.json({ url, token });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create share link', error: err });
  }
}

// Decode share token
export async function viewShare(req: Request, res: Response) {
  const { token } = req.params;
  try {
    const payload = jwt.verify(token, SHARE_SECRET) as any;
    res.json({ payload });
  } catch (e) {
    res.status(400).json({ message: 'invalid or expired token' });
  }
}
