import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Place } from '../models/Place';
import { Category } from '../models/Category';
import { Instructor } from '../models/Instructor';
import { badRequest, handleError, notFound } from '../utils/errorHandler';

export async function getPlaces(req: Request, res: Response) {
  try {
    // EXIGER PostgreSQL pour les relations complètes
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching places with relations' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Place);
    const places = await pgRepo.find({ 
      relations: ['category', 'instructor', 'courses'] 
    });
    res.json(places);
  } catch (err) {
    handleError(res, err, 'Failed to fetch places');
  }
}

export async function getPlaceById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // EXIGER PostgreSQL pour les relations complètes
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching place details' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Place);
    const place = await pgRepo.findOne({ 
      where: { id },
      relations: ['category', 'instructor', 'courses'] 
    });
    
    if (!place) return notFound(res, 'Place not found');
    res.json(place);
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

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place creation' 
      });
    }

    let pgCat = null;
    let sqliteCat = null;

    // Gestion de la catégorie - Vérification dans les deux bases
    if (category) {
      const pgCatRepo = pgDataSource.getRepository(Category);
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
    let sqliteInstructor = null;

    // Gestion de l'instructeur - Vérification dans les deux bases
    if (instructorId) {
      const pgInstructorRepo = pgDataSource.getRepository(Instructor);
      const sqliteInstructorRepo = sqliteDataSource.getRepository(Instructor);

      pgInstructor = await pgInstructorRepo.findOne({ where: { id: instructorId } });
      sqliteInstructor = await sqliteInstructorRepo.findOne({ where: { id: instructorId } });

      if (!pgInstructor || !sqliteInstructor) {
        return notFound(res, 'Instructor not found in both databases');
      }
    }

    // Création dans PostgreSQL
    const pgRepo = pgDataSource.getRepository(Place);
    const pgPlaceData = {
      name,
      description,
      latitude,
      longitude,
      category: pgCat,
      officeOwner,
      capacity,
      building,
      floor,
      code,
      instructor: pgInstructor
    };

    const pgPlace = pgRepo.create(pgPlaceData);
    const savedPgPlace = await pgRepo.save(pgPlace);

    // Création dans SQLite
    const sqliteRepo = sqliteDataSource.getRepository(Place);
    const sqlitePlaceData = {
      id: savedPgPlace.id, // Même ID
      name,
      description,
      latitude,
      longitude,
      category: sqliteCat,
      officeOwner,
      capacity,
      building,
      floor,
      code,
      instructor: sqliteInstructor // ✅ Maintenant disponible dans SQLite
    };
    
    const sqlitePlace = sqliteRepo.create(sqlitePlaceData);
    await sqliteRepo.save(sqlitePlace);

    console.log(`✅ Place created in both databases: ${savedPgPlace.id}`);
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

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place update' 
      });
    }

    // Vérifier l'existence dans les deux bases
    const pgRepo = pgDataSource.getRepository(Place);
    const sqliteRepo = sqliteDataSource.getRepository(Place);

    const pgPlace = await pgRepo.findOne({ 
      where: { id }, 
      relations: ['category', 'instructor'] 
    });
    const sqlitePlace = await sqliteRepo.findOne({ 
      where: { id }, 
      relations: ['category', 'instructor'] 
    });

    if (!pgPlace && !sqlitePlace) {
      return notFound(res, 'Place not found in any database');
    }

    if (pgPlace && !sqlitePlace) {
      return notFound(res, 'Place found in PostgreSQL but not in SQLite');
    }

    if (!pgPlace && sqlitePlace) {
      return notFound(res, 'Place found in SQLite but not in PostgreSQL');
    }

    // Gestion de la catégorie
    let pgCat = null;
    let sqliteCat = null;
    if (category) {
      const pgCatRepo = pgDataSource.getRepository(Category);
      const sqliteCatRepo = sqliteDataSource.getRepository(Category);

      pgCat = await pgCatRepo.findOne({ where: { name: category } });
      sqliteCat = await sqliteCatRepo.findOne({ where: { name: category } });

      if (!pgCat || !sqliteCat) {
        return notFound(res, `Category "${category}" not found in both databases`);
      }
    }

    // Gestion de l'instructeur
    let pgInstructor = null;
    let sqliteInstructor = null;
    if (instructorId) {
      const pgInstructorRepo = pgDataSource.getRepository(Instructor);
      const sqliteInstructorRepo = sqliteDataSource.getRepository(Instructor);

      pgInstructor = await pgInstructorRepo.findOne({ where: { id: instructorId } });
      sqliteInstructor = await sqliteInstructorRepo.findOne({ where: { id: instructorId } });

      if (!pgInstructor || !sqliteInstructor) {
        return notFound(res, 'Instructor not found in both databases');
      }
    }

    // Mise à jour PostgreSQL
    pgRepo.merge(pgPlace!, {
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
    if (category !== undefined) pgPlace!.category = pgCat;
    if (instructorId !== undefined) pgPlace!.instructor = pgInstructor;
    await pgRepo.save(pgPlace!);

    // Mise à jour SQLite
    sqliteRepo.merge(sqlitePlace!, {
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
    if (category !== undefined) sqlitePlace!.category = sqliteCat;
    if (instructorId !== undefined) sqlitePlace!.instructor = sqliteInstructor;
    await sqliteRepo.save(sqlitePlace!);

    console.log(`✅ Place updated in both databases: ${id}`);
    res.json(pgPlace);
  } catch (err) {
    handleError(res, err, 'Failed to update place');
  }
}

export async function getClassrooms(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Place);
    const pgCatRepo = pgDataSource.getRepository(Category);
    
    const classroomCategory = await pgCatRepo.findOne({ where: { name: 'Salle de cours' } });
    if (!classroomCategory) {
      return res.json([]);
    }
    
    const classrooms = await pgRepo.find({
      where: { category: { id: classroomCategory.id } },
      relations: ['courses', 'courses.instructor']
    });
    
    res.json(classrooms);
  } catch (err) {
    handleError(res, err, 'Failed to fetch classrooms');
  }
}

export async function getOffices(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Place);
    const pgCatRepo = pgDataSource.getRepository(Category);
    
    const officeCategory = await pgCatRepo.findOne({ where: { name: 'Bureau' } });
    if (!officeCategory) {
      return res.json([]);
    }
    
    const offices = await pgRepo.find({
      where: { category: { id: officeCategory.id } },
      relations: ['instructor']
    });
    
    res.json(offices);
  } catch (err) {
    handleError(res, err, 'Failed to fetch offices');
  }
}

export async function getOfficeByInstructor(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Place);
    const pgCatRepo = pgDataSource.getRepository(Category);
    
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

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for place deletion' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Place);
    const sqliteRepo = sqliteDataSource.getRepository(Place);

    // Vérifier l'existence dans les deux bases
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
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Place);
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
