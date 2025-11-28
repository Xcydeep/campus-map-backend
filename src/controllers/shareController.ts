import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pgDataSource } from '../loaders/database';
import { sqliteDataSource } from '../loaders/database'; // AJOUTÉ
import { Place } from '../models/Place';
import { PlaceLite } from '../models/PlaceLite'; // AJOUTÉ

const SHARE_SECRET = process.env.SHARE_SECRET || 'dev_share_secret';

// Generate a short-lived share token (TTL in seconds)
export async function createShare(req: Request, res: Response) {
  try {
    const { placeId, ttl = 3600 } = req.body;
    if (!placeId) return res.status(400).json({ message: 'placeId required' });

    let place = null;

    // Chercher d'abord dans PostgreSQL
    if (pgDataSource) {
      const pgRepo = pgDataSource.getRepository(Place);
      place = await pgRepo.findOne({ where: { id: placeId } as any });
    }

    // Si pas trouvé, chercher dans SQLite (offline)
    if (!place && sqliteDataSource) {
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      place = await sqliteRepo.findOne({ where: { id: placeId } as any });
    }

    if (!place) return res.status(404).json({ message: 'place not found' });

    // Créer le payload commun
    const payload = { 
      id: place.id, 
      name: place.name, 
      lat: place.latitude, 
      lon: place.longitude 
    };

    const token = jwt.sign(payload, SHARE_SECRET, { expiresIn: ttl });
    const url = `/share/${token}`;

    res.json({ 
      url, 
      token,
      place: payload // Retourne aussi les infos du lieu pour confirmation
    });
  } catch (err) {
    console.error('Share creation error:', err);
    res.status(500).json({ message: 'Failed to create share link', error: err });
  }
}

// Decode share token - ACCESSIBLE SANS AUTH POUR LE PARTAGE
export async function viewShare(req: Request, res: Response) {
  const { token } = req.params;
  
  try {
    const payload = jwt.verify(token, SHARE_SECRET) as any;
    
    // Optionnel: Vérifier si le lieu existe encore
    let placeExists = false;
    
    if (pgDataSource) {
      const pgRepo = pgDataSource.getRepository(Place);
      const place = await pgRepo.findOne({ where: { id: payload.id } as any });
      if (place) placeExists = true;
    }
    
    if (!placeExists && sqliteDataSource) {
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      const place = await sqliteRepo.findOne({ where: { id: payload.id } as any });
      if (place) placeExists = true;
    }

    res.json({ 
      payload,
      exists: placeExists // Indique si le lieu existe encore
    });
  } catch (e) {
    res.status(400).json({ message: 'invalid or expired token' });
  }
}