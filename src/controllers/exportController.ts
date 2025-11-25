import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Place } from '../models/Place';
import { Category } from '../models/Category';
import { Course } from '../models/Course';
import { Instructor } from '../models/Instructor';
import { handleError } from '../utils/errorHandler';

// Export pour usage mobile/hors ligne (existant - à mettre à jour)
export async function exportOfflinePack(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const [
      categories,
      places, 
      courses,
      instructors
    ] = await Promise.all([
      pgDataSource.getRepository(Category).find(),
      pgDataSource.getRepository(Place).find({ relations: ['category'] }),
      pgDataSource.getRepository(Course).find({ relations: ['place', 'instructor'] }),
      pgDataSource.getRepository(Instructor).find({ relations: ['office'] })
    ]);

    const pack = { 
      generatedAt: new Date().toISOString(),
      version: '2.0', // Version mise à jour
      data: {
        categories,
        places: places.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          latitude: p.latitude,
          longitude: p.longitude,
          category: p.category?.name,
          building: p.building,
          floor: p.floor,
          code: p.code,
          capacity: p.capacity,
          photos: p.photos
        })),
        courses: courses.map(c => ({
          id: c.id,
          code: c.code,
          title: c.title,
          lecturer: c.lecturer,
          startAt: c.startAt,
          endAt: c.endAt,
          place: c.place ? {
            id: c.place.id,
            name: c.place.name,
            code: c.place.code
          } : null,
          instructor: c.instructor ? {
            id: c.instructor.id,
            name: c.instructor.name
          } : null
        })),
       instructors: instructors.map(i => ({
        id: i.id,
        name: i.name,
        email: i.email,
        offices: i.places?.map(o => ({
          id: o.id,
          name: o.name,
          code: o.code
        })) || []
      }))

      }
    };

    res.json(pack);
  } catch (err) {
    handleError(res, err, 'Failed to export offline pack');
  }
}

// NOUVEAU: Export pour graphe de navigation (remplace graphExportController)
export async function exportGraphJSON(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const placeRepo = pgDataSource.getRepository(Place);
    const places = await placeRepo.find({ relations: ['category'] });

    // Créer les nœuds du graphe avec les Places uniquement
    const nodes = places.map(place => ({
      id: place.id,
      type: 'place',
      name: place.name,
      category: place.category?.name,
      lat: place.latitude,
      lon: place.longitude,
      building: place.building,
      floor: place.floor,
      metadata: {
        capacity: place.capacity,
        code: place.code,
        description: place.description
      }
    }));

    // Les arêtes (edges) seront gérées séparément via import CSV
    const edges: any[] = [];

    const graphData = {
      generatedAt: new Date().toISOString(),
      nodes,
      edges
    };

    res.json(graphData);
  } catch (err) {
    handleError(res, err, 'Failed to export graph JSON');
  }
}

// NOUVEAU: Export SQLite simplifié (remplace sqliteExportController)
export async function exportSqlite(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const [
      categories,
      places
    ] = await Promise.all([
      pgDataSource.getRepository(Category).find(),
      pgDataSource.getRepository(Place).find({ relations: ['category'] })
    ]);

    // Format simplifié pour SQLite
    const sqliteData = {
      exportedAt: new Date().toISOString(),
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name
      })),
      places: places.map(place => ({
        id: place.id,
        name: place.name,
        description: place.description,
        latitude: place.latitude,
        longitude: place.longitude,
        categoryId: place.category?.id,
        categoryName: place.category?.name,
        building: place.building,
        floor: place.floor,
        code: place.code,
        capacity: place.capacity
      }))
    };

    res.json(sqliteData);
  } catch (err) {
    handleError(res, err, 'Failed to export SQLite data');
  }
}