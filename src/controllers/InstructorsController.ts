import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Instructor } from '../models/Instructor';
import { badRequest, conflict, handleError, notFound } from '../utils/errorHandler';

// GET /api/instructors - Lister tous les instructeurs
export async function listInstructors(req: Request, res: Response) {
  try {
    // EXIGER PostgreSQL pour les relations complètes
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching instructors with relations' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructors = await pgRepo.find({
      relations: ['courses', 'office'] // Relations avec les cours et le bureau
    });
    
    res.json(instructors);
  } catch (err) {
    handleError(res, err, 'Failed to fetch instructors');
  }
}

// GET /api/instructors/:id - Récupérer un instructeur par ID
export async function getInstructorById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // EXIGER PostgreSQL pour les relations complètes
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching instructor details' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['courses', 'office', 'courses.place'] // Relations complètes
    });

    if (!instructor) {
      return notFound(res, 'Instructor not found');
    }

    res.json(instructor);
  } catch (err) {
    handleError(res, err, 'Failed to fetch instructor');
  }
}

// GET /api/instructors/search/:name - Rechercher un instructeur par nom
export async function getInstructorByName(req: Request, res: Response) {
  try {
    const { name } = req.params;

    if (!name) {
      return badRequest(res, 'Instructor name is required for search');
    }

    // EXIGER PostgreSQL pour la recherche avec relations
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor search' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { name },
      relations: ['courses', 'office']
    });

    if (!instructor) {
      return notFound(res, `Instructor not found: ${name}`);
    }

    res.json(instructor);
  } catch (err) {
    handleError(res, err, 'Failed to search instructor');
  }
}

// POST /api/instructors - Créer un nouvel instructeur
export async function createInstructor(req: Request, res: Response) {
  try {
    const { name, email, phone, department } = req.body;

    // Validation
    if (!name) {
      return badRequest(res, 'Instructor name is required');
    }

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor creation' 
      });
    }

    // Vérifier l'existence dans PostgreSQL
    const pgRepo = pgDataSource.getRepository(Instructor);
    const existingPgInstructor = await pgRepo.findOne({ where: { name } });
    if (existingPgInstructor) {
      return conflict(res, 'Instructor already exists in PostgreSQL');
    }

    // Vérifier l'existence dans SQLite
    const sqliteRepo = sqliteDataSource.getRepository(Instructor);
    const existingSqliteInstructor = await sqliteRepo.findOne({ where: { name } });
    if (existingSqliteInstructor) {
      return conflict(res, 'Instructor already exists in SQLite');
    }

    // Création dans PostgreSQL
    const pgInstructor = pgRepo.create({ name, email, phone, department });
    const savedPgInstructor = await pgRepo.save(pgInstructor);

    // Création dans SQLite
    const sqliteInstructor = sqliteRepo.create({
      id: savedPgInstructor.id, // Même ID
      name,
      email,
      phone,
      department
    });
    await sqliteRepo.save(sqliteInstructor);

    console.log(`✅ Instructor created in both databases: ${name} (ID: ${savedPgInstructor.id})`);
    res.status(201).json(savedPgInstructor);
  } catch (err) {
    handleError(res, err, 'Failed to create instructor');
  }
}

// PUT /api/instructors/:id - Mettre à jour un instructeur
export async function updateInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, email, phone, department } = req.body;

    // Validation
    if (!name) {
      return badRequest(res, 'Instructor name is required');
    }

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor update' 
      });
    }

    // Vérifier l'existence dans les deux bases
    const pgRepo = pgDataSource.getRepository(Instructor);
    const sqliteRepo = sqliteDataSource.getRepository(Instructor);

    const pgInstructor = await pgRepo.findOne({ where: { id } });
    const sqliteInstructor = await sqliteRepo.findOne({ where: { id } });

    if (!pgInstructor && !sqliteInstructor) {
      return notFound(res, 'Instructor not found in any database');
    }

    if (pgInstructor && !sqliteInstructor) {
      return notFound(res, 'Instructor found in PostgreSQL but not in SQLite');
    }

    if (!pgInstructor && sqliteInstructor) {
      return notFound(res, 'Instructor found in SQLite but not in PostgreSQL');
    }

    // Vérifier les conflits de nom (si le nom change)
    if (name !== pgInstructor!.name) {
      const existingWithSameName = await pgRepo.findOne({ where: { name } });
      if (existingWithSameName && existingWithSameName.id !== id) {
        return conflict(res, 'Another instructor with this name already exists');
      }
    }

    // Mise à jour PostgreSQL
    pgRepo.merge(pgInstructor!, { name, email, phone, department });
    const updatedPgInstructor = await pgRepo.save(pgInstructor!);

    // Mise à jour SQLite
    sqliteRepo.merge(sqliteInstructor!, { name, email, phone, department });
    await sqliteRepo.save(sqliteInstructor!);

    console.log(`✅ Instructor updated in both databases: ${id}`);
    res.json(updatedPgInstructor);
  } catch (err) {
    handleError(res, err, 'Failed to update instructor');
  }
}

// PATCH /api/instructors/:id - Mettre à jour partiellement un instructeur
export async function patchInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validation: au moins un champ à mettre à jour
    if (Object.keys(updates).length === 0) {
      return badRequest(res, 'No fields to update provided');
    }

    // Champs autorisés
    const allowedFields = ['name', 'email', 'phone', 'department'];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return badRequest(res, `Invalid fields: ${invalidFields.join(', ')}`);
    }

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor update' 
      });
    }

    // Vérifier l'existence dans les deux bases
    const pgRepo = pgDataSource.getRepository(Instructor);
    const sqliteRepo = sqliteDataSource.getRepository(Instructor);

    const pgInstructor = await pgRepo.findOne({ where: { id } });
    const sqliteInstructor = await sqliteRepo.findOne({ where: { id } });

    if (!pgInstructor && !sqliteInstructor) {
      return notFound(res, 'Instructor not found in any database');
    }

    if (pgInstructor && !sqliteInstructor) {
      return notFound(res, 'Instructor found in PostgreSQL but not in SQLite');
    }

    if (!pgInstructor && sqliteInstructor) {
      return notFound(res, 'Instructor found in SQLite but not in PostgreSQL');
    }

    // Vérifier les conflits de nom (si le nom est modifié)
    if (updates.name && updates.name !== pgInstructor!.name) {
      const existingWithSameName = await pgRepo.findOne({ where: { name: updates.name } });
      if (existingWithSameName && existingWithSameName.id !== id) {
        return conflict(res, 'Another instructor with this name already exists');
      }
    }

    // Mise à jour PostgreSQL
    pgRepo.merge(pgInstructor!, updates);
    const updatedPgInstructor = await pgRepo.save(pgInstructor!);

    // Mise à jour SQLite
    sqliteRepo.merge(sqliteInstructor!, updates);
    await sqliteRepo.save(sqliteInstructor!);

    console.log(`✅ Instructor patched in both databases: ${id}`);
    res.json(updatedPgInstructor);
  } catch (err) {
    handleError(res, err, 'Failed to patch instructor');
  }
}

// DELETE /api/instructors/:id - Supprimer un instructeur
export async function deleteInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // EXIGER les deux bases de données
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for instructor deletion' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const sqliteRepo = sqliteDataSource.getRepository(Instructor);

    // Vérifier l'existence dans les deux bases
    const pgInstructor = await pgRepo.findOne({ 
      where: { id },
      relations: ['courses', 'office'] // Vérifier les relations avant suppression
    });
    const sqliteInstructor = await sqliteRepo.findOne({ where: { id } });

    if (!pgInstructor && !sqliteInstructor) {
      return notFound(res, 'Instructor not found in any database');
    }

    // Vérifier les contraintes de clé étrangère
    if (pgInstructor) {
      if (pgInstructor.courses && pgInstructor.courses.length > 0) {
        return badRequest(res, 'Cannot delete instructor with associated courses');
      }
      
      if (pgInstructor.places) {
        return badRequest(res, 'Cannot delete instructor with assigned office');
      }
    }

    // Supprimer de PostgreSQL
    if (pgInstructor) {
      await pgRepo.remove(pgInstructor);
    }

    // Supprimer de SQLite
    if (sqliteInstructor) {
      await sqliteRepo.remove(sqliteInstructor);
    }

    console.log(`✅ Instructor deleted from both databases: ${id}`);
    res.status(204).send();
  } catch (err) {
    // Gestion spécifique des erreurs de contrainte de clé étrangère
    if (err instanceof Error && err.message.includes('foreign key constraint')) {
      return res.status(400).json({
        message: 'Cannot delete instructor due to existing references in other tables'
      });
    }
    handleError(res, err, 'Failed to delete instructor');
  }
}

// GET /api/instructors/:id/courses - Récupérer les cours d'un instructeur
export async function getInstructorCourses(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // EXIGER PostgreSQL pour les relations
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching instructor courses' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['courses', 'courses.place', 'courses.place.category']
    });

    if (!instructor) {
      return notFound(res, 'Instructor not found');
    }

    res.json(instructor.courses || []);
  } catch (err) {
    handleError(res, err, 'Failed to fetch instructor courses');
  }
}

// GET /api/instructors/:id/office - Récupérer le bureau d'un instructeur
export async function getInstructorOffice(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // EXIGER PostgreSQL pour les relations
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ 
        message: 'PostgreSQL required for fetching instructor office' 
      });
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['office', 'office.category']
    });

    if (!instructor) {
      return notFound(res, 'Instructor not found');
    }

    if (!instructor.places) {
      return notFound(res, 'Instructor does not have an assigned office');
    }

    res.json(instructor.places);
  } catch (err) {
    handleError(res, err, 'Failed to fetch instructor office');
  }
}