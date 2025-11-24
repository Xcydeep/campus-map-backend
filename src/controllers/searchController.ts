import { Request, Response } from 'express';
import { Like, getRepository } from 'typeorm';
import { Place } from '../models/Place';
import { badRequest, handleError } from '../utils/errorHandler';

export async function searchPlaces(req: Request, res: Response) {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return badRequest(res, 'Query parameter q is required');
    }
    const repo = getRepository(Place);
    const places = await repo.find({ where: { name: Like(`%${q}%`) } });
    res.json(places);
  } catch (err) {
    handleError(res, err, 'Search failed');
  }
}

export async function autocompletePlaces(req: Request, res: Response) {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return badRequest(res, 'Query parameter q is required');
    }
    const repo = getRepository(Place);
    const places = await repo.find({
      where: { name: Like(`${q}%`) },
      take: 10,
    });
    res.json(places);
  } catch (err) {
    handleError(res, err, 'Autocomplete search failed');
  }
}
