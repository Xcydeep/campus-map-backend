import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Place } from '../models/Place';
import { PlaceLite } from '../models/PlaceLite';
import { Category } from '../models/Category';
import { Instructor } from '../models/Instructor';
import { badRequest, handleError, notFound } from '../utils/errorHandler';

// Fonction utilitaire pour vérifier la connectivité PostgreSQL
async function isPostgreSQLAvailable(): Promise<boolean> {
  try {
    if (!pgDataSource?.isInitialized) {
      return false;
    }
    
    // Test simple de connexion
    await pgDataSource.query('SELECT 1');
    return true;
  } catch (error) {
    console.warn('PostgreSQL not available, falling back to SQLite');
    return false;
  }
}

export async function getPlaces(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (postgresAvailable) {
      // Récupération depuis PostgreSQL avec relations complètes
      const pgRepo = pgDataSource!.getRepository(Place);
      const places = await pgRepo.find({ 
        relations: ['category', 'instructor', 'courses'] 
      });
      return res.json(places);
    } else {
      // Récupération depuis SQLite (version allégée)
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      const placesLite = await sqliteRepo.find({ 
        relations: ['category'] 
      });
      
      // Conversion vers le format standard pour la compatibilité
      const formattedPlaces = placesLite.map(place => ({
        id: place.id,
        name: place.name,
        description: null,
        photos: null,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
        officeOwner: null,
        capacity: null,
        building: null,
        floor: null,
        code: null,
        instructor: null,
        courses: []
      }));
      
      return res.json(formattedPlaces);
    }
  } catch (err) {
    handleError(res, err, 'Failed to fetch places');
  }
}

export async function getPlaceById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (postgresAvailable) {
      const pgRepo = pgDataSource!.getRepository(Place);
      const place = await pgRepo.findOne({ 
        where: { id },
        relations: ['category', 'instructor', 'courses'] 
      });
      
      if (!place) return notFound(res, 'Place not found');
      return res.json(place);
    } else {
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      const placeLite = await sqliteRepo.findOne({ 
        where: { id },
        relations: ['category'] 
      });
      
      if (!placeLite) return notFound(res, 'Place not found');
      
      // Conversion vers le format standard
      const formattedPlace = {
        id: placeLite.id,
        name: placeLite.name,
        description: null,
        photos: null,
        latitude: placeLite.latitude,
        longitude: placeLite.longitude,
        category: placeLite.category,
        officeOwner: null,
        capacity: null,
        building: null,
        floor: null,
        code: null,
        instructor: null,
        courses: []
      };
      
      return res.json(formattedPlace);
    }
  } catch (err) {
    handleError(res, err, 'Failed to fetch place');
  }
}

export async function createPlace(req: Request, res: Response) {
  try {
    const { 
      name, 
      description, 
      latitude, 
      longitude, 
      category,
      officeOwner,
      capacity,
      building,
      floor,
      code,
      instructorId
    } = req.body;

    // Validation basique
    if (!name || !latitude || !longitude) {
      return badRequest(res, 'Name, latitude and longitude are required');
    }

    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place creation' 
      });
    }

    let pgCat = null;
    let sqliteCat = null;

    // Gestion de la catégorie - Vérification dans les deux bases
    if (category) {
      const pgCatRepo = pgDataSource!.getRepository(Category);
      const sqliteCatRepo = sqliteDataSource.getRepository(Category);

      pgCat = await pgCatRepo.findOne({ where: { name: category } });
      sqliteCat = await sqliteCatRepo.findOne({ where: { name: category } });

      // Créer la catégorie si elle n'existe pas
      if (!pgCat) {
        pgCat = pgCatRepo.create({ name: category });
        await pgCatRepo.save(pgCat);
      }
      if (!sqliteCat) {
        sqliteCat = sqliteCatRepo.create({ 
          id: pgCat.id, // Même ID
          name: category 
        });
        await sqliteCatRepo.save(sqliteCat);
      }
    }

    let pgInstructor = null;

    // Gestion de l'instructeur - PostgreSQL seulement
    if (instructorId) {
      const pgInstructorRepo = pgDataSource!.getRepository(Instructor);
      pgInstructor = await pgInstructorRepo.findOne({ where: { id: instructorId } });

      if (!pgInstructor) {
        return notFound(res, 'Instructor not found');
      }
    }

    // Création dans PostgreSQL
    const pgRepo = pgDataSource!.getRepository(Place);
    const pgPlace = pgRepo.create({
      name,
      description,
      latitude,
      longitude,
      category: pgCat || undefined,
      officeOwner,
      capacity,
      building,
      floor,
      code,
      instructor: pgInstructor || undefined
    });
    const savedPgPlace = await pgRepo.save(pgPlace);

    // Création dans SQLite (version allégée)
    const sqlitePlaceRepo = sqliteDataSource.getRepository(PlaceLite);
    const sqlitePlace = sqlitePlaceRepo.create({
      id: savedPgPlace.id,
      name: savedPgPlace.name,
      latitude: savedPgPlace.latitude,
      longitude: savedPgPlace.longitude,
      category: sqliteCat || undefined
    });
    await sqlitePlaceRepo.save(sqlitePlace);

    res.status(201).json(savedPgPlace);
  } catch (err) {
    handleError(res, err, 'Failed to create place');
  }
}

export async function updatePlace(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      latitude, 
      longitude, 
      category,
      officeOwner,
      capacity,
      building,
      floor,
      code,
      instructorId
    } = req.body;

    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place update' 
      });
    }

    // Vérifier l'existence dans les deux bases
    const pgRepo = pgDataSource!.getRepository(Place);
    const sqlitePlaceRepo = sqliteDataSource.getRepository(PlaceLite);

    const pgPlace = await pgRepo.findOne({ 
      where: { id }, 
      relations: ['category', 'instructor'] 
    });
    const sqlitePlace = await sqlitePlaceRepo.findOne({ 
      where: { id }, 
      relations: ['category'] 
    });

    if (!pgPlace && !sqlitePlace) {
      return notFound(res, 'Place not found in any database');
    }

    // Gestion de la catégorie
    let pgCat = null;
    let sqliteCat = null;
    if (category) {
      const pgCatRepo = pgDataSource!.getRepository(Category);
      const sqliteCatRepo = sqliteDataSource.getRepository(Category);

      pgCat = await pgCatRepo.findOne({ where: { name: category } });
      sqliteCat = await sqliteCatRepo.findOne({ where: { name: category } });

      if (!pgCat || !sqliteCat) {
        return notFound(res, `Category "${category}" not found in both databases`);
      }
    }

    // Gestion de l'instructeur (PostgreSQL seulement)
    let pgInstructor = null;
    if (instructorId) {
      const pgInstructorRepo = pgDataSource!.getRepository(Instructor);
      pgInstructor = await pgInstructorRepo.findOne({ where: { id: instructorId } });

      if (!pgInstructor) {
        return notFound(res, 'Instructor not found');
      }
    }

    // Mise à jour PostgreSQL
    if (pgPlace) {
      pgRepo.merge(pgPlace, {
        name,
        description,
        latitude,
        longitude,
        officeOwner,
        capacity,
        building,
        floor,
        code
      });
      
      if (category !== undefined && pgCat) pgPlace.category = pgCat;
      if (instructorId !== undefined) pgPlace.instructor = pgInstructor || undefined;
      
      await pgRepo.save(pgPlace);
    }

    // Mise à jour SQLite (champs allégés seulement)
    if (sqlitePlace) {
      sqlitePlaceRepo.merge(sqlitePlace, {
        name,
        latitude,
        longitude
      });
      
      if (category !== undefined && sqliteCat) sqlitePlace.category = sqliteCat;
      
      await sqlitePlaceRepo.save(sqlitePlace);
    }

    console.log(`✅ Place updated in both databases: ${id}`);
    res.json(pgPlace || sqlitePlace);
  } catch (err) {
    handleError(res, err, 'Failed to update place');
  }
}

export async function getClassrooms(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (postgresAvailable) {
      const pgRepo = pgDataSource!.getRepository(Place);
      const pgCatRepo = pgDataSource!.getRepository(Category);
      
      const classroomCategory = await pgCatRepo.findOne({ where: { name: 'Salle de cours' } });
      if (!classroomCategory) {
        return res.json([]);
      }
      
      const classrooms = await pgRepo.find({
        where: { category: { id: classroomCategory.id } },
        relations: ['courses', 'courses.instructor']
      });
      
      return res.json(classrooms);
    } else {
      // Fallback SQLite - récupération basique
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      const sqliteCatRepo = sqliteDataSource.getRepository(Category);
      
      const classroomCategory = await sqliteCatRepo.findOne({ where: { name: 'Salle de cours' } });
      if (!classroomCategory) {
        return res.json([]);
      }
      
      const classroomsLite = await sqliteRepo.find({
        where: { category: { id: classroomCategory.id } },
        relations: ['category']
      });
      
      // Conversion vers le format standard
      const formattedClassrooms = classroomsLite.map(classroom => ({
        id: classroom.id,
        name: classroom.name,
        description: null,
        photos: null,
        latitude: classroom.latitude,
        longitude: classroom.longitude,
        category: classroom.category,
        officeOwner: null,
        capacity: null,
        building: null,
        floor: null,
        code: null,
        instructor: null,
        courses: []
      }));
      
      return res.json(formattedClassrooms);
    }
  } catch (err) {
    handleError(res, err, 'Failed to fetch classrooms');
  }
}

export async function getOffices(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (postgresAvailable) {
      const pgRepo = pgDataSource!.getRepository(Place);
      const pgCatRepo = pgDataSource!.getRepository(Category);
      
      const officeCategory = await pgCatRepo.findOne({ where: { name: 'Bureau' } });
      if (!officeCategory) {
        return res.json([]);
      }
      
      const offices = await pgRepo.find({
        where: { category: { id: officeCategory.id } },
        relations: ['instructor']
      });
      
      return res.json(offices);
    } else {
      // Fallback SQLite
      const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);
      const sqliteCatRepo = sqliteDataSource.getRepository(Category);
      
      const officeCategory = await sqliteCatRepo.findOne({ where: { name: 'Bureau' } });
      if (!officeCategory) {
        return res.json([]);
      }
      
      const officesLite = await sqliteRepo.find({
        where: { category: { id: officeCategory.id } },
        relations: ['category']
      });
      
      const formattedOffices = officesLite.map(office => ({
        id: office.id,
        name: office.name,
        description: null,
        photos: null,
        latitude: office.latitude,
        longitude: office.longitude,
        category: office.category,
        officeOwner: null,
        capacity: null,
        building: null,
        floor: null,
        code: null,
        instructor: null,
        courses: []
      }));
      
      return res.json(formattedOffices);
    }
  } catch (err) {
    handleError(res, err, 'Failed to fetch offices');
  }
}

export async function getOfficeByInstructor(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor office lookup' 
      });
    }
    
    const pgRepo = pgDataSource!.getRepository(Place);
    const pgCatRepo = pgDataSource!.getRepository(Category);
    
    const { instructorName } = req.params;
    
    const officeCategory = await pgCatRepo.findOne({ where: { name: 'Bureau' } });
    if (!officeCategory) {
      return notFound(res, 'Office category not found');
    }
    
    const office = await pgRepo.findOne({
      where: { 
        category: { id: officeCategory.id },
        instructor: { name: instructorName }
      },
      relations: ['instructor', 'category']
    });
    
    if (!office) {
      return notFound(res, `Office not found for instructor: ${instructorName}`);
    }
    
    res.json(office);
  } catch (err) {
    handleError(res, err, 'Failed to find office by instructor');
  }
}

export async function deletePlace(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place deletion' 
      });
    }

    const pgRepo = pgDataSource!.getRepository(Place);
    const sqliteRepo = sqliteDataSource.getRepository(PlaceLite);

    // Vérifier l'existence dans au moins une base
    const pgPlace = await pgRepo.findOne({ where: { id } });
    const sqlitePlace = await sqliteRepo.findOne({ where: { id } });

    if (!pgPlace && !sqlitePlace) {
      return notFound(res, 'Place not found in any database');
    }

    // Supprimer de PostgreSQL
    if (pgPlace) {
      await pgRepo.remove(pgPlace);
    }

    // Supprimer de SQLite
    if (sqlitePlace) {
      await sqliteRepo.remove(sqlitePlace);
    }

    console.log(`✅ Place deleted from both databases: ${id}`);
    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'Failed to delete place');
  }
}

export async function uploadPlacePhotos(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for photo upload' 
      });
    }
    
    const pgRepo = pgDataSource!.getRepository(Place);
    const { id } = req.params;
    const place = await pgRepo.findOne({ where: { id } });
    if (!place) return notFound(res, 'Place not found');
    
    const photos: string[] = place.photos || [];
    if (req.files && Array.isArray(req.files)) {
      for (const f of req.files as any[]) photos.push(f.path);
    }
    place.photos = photos;
    await pgRepo.save(place);
    res.json(place);
  } catch (err) {
    handleError(res, err, 'Failed to upload photos');
  }
}