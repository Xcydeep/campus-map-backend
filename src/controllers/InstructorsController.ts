import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Instructor } from '../models/Instructor';
import { Course } from '../models/Course';
import { Place } from '../models/Place';
import { 
  badRequest, 
  conflict, 
  handleError, 
  notFound,
  serviceUnavailable 
} from '../utils/errorHandler';

// Interface pour les erreurs typées
interface DatabaseError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
}

// Type guard pour vérifier le type d'erreur
function isDatabaseError(error: unknown): error is DatabaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('code' in error || 'detail' in error || 'constraint' in error)
  );
}

// Fonction pour extraire le message d'erreur de manière sécurisée
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (isDatabaseError(error)) {
    return error.message || 'Database error occurred';
  }
  return 'Unknown error occurred';
}

// -------------------------------------------------------
//   LIST INSTRUCTORS
// -------------------------------------------------------
export async function listInstructors(req: Request, res: Response) {
  try {
    // Vérifier disponibilité PostgreSQL
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructors = await pgRepo.find({
      relations: ['courses', 'places'], // CORRECTION: 'places' au lieu de 'office'
      order: { name: 'ASC' }
    });
    
    console.log(`✅ ${instructors.length} instructeurs récupérés depuis PostgreSQL`);
    return res.status(200).json({
      success: true,
      message: `Liste des instructeurs récupérée avec succès (${instructors.length} éléments)`,
      data: instructors,
      count: instructors.length
    });
  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la récupération des instructeurs:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur lors de la récupération des instructeurs',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}

// -------------------------------------------------------
//   GET INSTRUCTOR BY ID
// -------------------------------------------------------
export async function getInstructorById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Validation ID
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // Vérifier disponibilité PostgreSQL
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['courses', 'places', 'courses.place'] // CORRECTION: 'places' au lieu de 'office'
    });

    if (!instructor) {
      console.warn(`⚠️ Instructeur non trouvé - ID: ${id}`);
      return notFound(res, `Instructeur avec l'ID "${id}" introuvable.`);
    }

    console.log(`✅ Instructeur récupéré - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: 'Instructeur récupéré avec succès',
      data: instructor
    });
  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la récupération de l\'instructeur:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur lors de la récupération de l\'instructeur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   GET INSTRUCTOR BY NAME
// -------------------------------------------------------
export async function getInstructorByName(req: Request, res: Response) {
  try {
    const { name } = req.params;

    // Validation nom
    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Nom d\'instructeur requis pour la recherche.');
    }

    const decodedName = decodeURIComponent(name);

    // Vérifier disponibilité PostgreSQL
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { name: decodedName },
      relations: ['courses', 'places'] // CORRECTION: 'places' au lieu de 'office'
    });

    if (!instructor) {
      console.warn(`⚠️ Instructeur non trouvé - Nom: "${decodedName}"`);
      return notFound(res, `Instructeur "${decodedName}" introuvable.`);
    }

    console.log(`✅ Instructeur trouvé - Nom: "${decodedName}"`);
    return res.status(200).json({
      success: true,
      message: `Instructeur "${decodedName}" trouvé avec succès`,
      data: instructor
    });
  } catch (err: unknown) {
    console.error('❌ Erreur lors de la recherche d\'instructeur par nom:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche d\'instructeur par nom',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   CREATE INSTRUCTOR
// -------------------------------------------------------
export async function createInstructor(req: Request, res: Response) {
  try {
    const { name, email, phone, department } = req.body;

    // -------- VALIDATIONS RENFORCÉES --------
    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Le nom de l\'instructeur est requis et doit être une chaîne de caractères.');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return badRequest(res, 'Le nom de l\'instructeur doit contenir au moins 2 caractères.');
    }

    if (trimmedName.length > 100) {
      return badRequest(res, 'Le nom de l\'instructeur ne peut pas dépasser 100 caractères.');
    }

    // Validation email si fourni
    if (email && typeof email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return badRequest(res, 'Format d\'email invalide.');
      }
    }

    // Validation téléphone si fourni
    if (phone && typeof phone === 'string' && phone.length > 20) {
      return badRequest(res, 'Le numéro de téléphone ne peut pas dépasser 20 caractères.');
    }

    // Vérifier disponibilité PostgreSQL SEULEMENT
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);

    // -------- VÉRIFICATION DOUBLON --------
    const existingPgInstructor = await pgRepo.findOne({ where: { name: trimmedName } });
    if (existingPgInstructor) {
      console.warn(`⚠️ Tentative de création d'un instructeur existant dans PostgreSQL: "${trimmedName}"`);
      return conflict(res, `Un instructeur avec le nom "${trimmedName}" existe déjà.`);
    }

    // -------- CRÉATION POSTGRESQL SEULEMENT --------
    console.log(`🔄 Début de création de l'instructeur: "${trimmedName}"`);
    const pgInstructor = pgRepo.create({ 
      name: trimmedName, 
      email: email?.trim() || undefined, 
      phone: phone?.trim() || undefined, 
      department: department?.trim() || undefined 
    });
    const savedPgInstructor = await pgRepo.save(pgInstructor);
    console.log(`✅ Instructeur créé dans PostgreSQL - ID: ${savedPgInstructor.id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Instructeur créé avec succès: "${trimmedName}" (ID: ${savedPgInstructor.id})`);
    return res.status(201).json({
      success: true,
      message: `Instructeur "${trimmedName}" créé avec succès`,
      data: savedPgInstructor,
      details: {
        id: savedPgInstructor.id,
        name: savedPgInstructor.name,
        createdIn: ['postgresql'],
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la création de l\'instructeur:', err);
    
    if (isDatabaseError(err) && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Un instructeur avec ce nom existe déjà',
        error: 'DUPLICATE_INSTRUCTOR'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la création de l\'instructeur - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   UPDATE INSTRUCTOR (PUT - remplacement complet)
// -------------------------------------------------------
// -------------------------------------------------------
//   UPDATE INSTRUCTOR (PUT - remplacement complet - PostgreSQL seulement)
// -------------------------------------------------------
export async function updateInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, email, phone, department } = req.body;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // -------- VALIDATIONS CHAMPS --------
    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Le nom de l\'instructeur est requis.');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return badRequest(res, 'Le nom de l\'instructeur doit contenir au moins 2 caractères.');
    }

    if (trimmedName.length > 100) {
      return badRequest(res, 'Le nom de l\'instructeur ne peut pas dépasser 100 caractères.');
    }

    // Validation email si fourni
    if (email && typeof email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return badRequest(res, 'Format d\'email invalide.');
      }
    }

    // Validation téléphone si fourni
    if (phone && typeof phone === 'string' && phone.trim().length > 20) {
      return badRequest(res, 'Le numéro de téléphone ne peut pas dépasser 20 caractères.');
    }

    // Vérifier disponibilité PostgreSQL SEULEMENT
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);

    // -------- VÉRIFICATION EXISTENCE INSTRUCTEUR --------
    console.log(`🔄 Recherche de l'instructeur à mettre à jour - ID: ${id}`);
    const pgInstructor = await pgRepo.findOne({ where: { id } });

    if (!pgInstructor) {
      console.warn(`⚠️ Tentative de mise à jour d'un instructeur inexistant - ID: ${id}`);
      return notFound(res, `Instructeur avec l'ID "${id}" introuvable.`);
    }

    // -------- VÉRIFICATION DOUBLON NOM --------
    if (trimmedName !== pgInstructor.name) {
      const existingWithSameName = await pgRepo.findOne({ 
        where: { name: trimmedName } 
      });
      
      if (existingWithSameName && existingWithSameName.id !== id) {
        console.warn(`⚠️ Conflit de nom lors de la mise à jour - ID: ${id}, Nom: "${trimmedName}"`);
        return conflict(res, `Un autre instructeur avec le nom "${trimmedName}" existe déjà.`);
      }
    }

    // -------- SAUVEGARDE ANCIEN NOM POUR LOGS --------
    const oldName = pgInstructor.name;

    // -------- MISE À JOUR POSTGRESQL --------
    console.log(`🔄 Mise à jour PostgreSQL - ID: ${id}, Ancien: "${oldName}", Nouveau: "${trimmedName}"`);
    pgRepo.merge(pgInstructor, {
      name: trimmedName,
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      department: department?.trim() || undefined
    });
    const updatedPgInstructor = await pgRepo.save(pgInstructor);
    console.log(`✅ Instructeur mis à jour - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Instructeur mis à jour avec succès - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: `Instructeur mis à jour avec succès de "${oldName}" vers "${trimmedName}"`,
      data: updatedPgInstructor,
      details: {
        id,
        oldName,
        newName: trimmedName,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la mise à jour de l\'instructeur:', err);
    
    if (isDatabaseError(err) && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Un autre instructeur avec ce nom existe déjà',
        error: 'DUPLICATE_INSTRUCTOR_NAME'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la mise à jour de l\'instructeur - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   PATCH INSTRUCTOR (mise à jour partielle - PostgreSQL seulement)
// -------------------------------------------------------
export async function patchInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // -------- VALIDATION UPDATES --------
    if (!updates || Object.keys(updates).length === 0) {
      return badRequest(res, 'Aucun champ à mettre à jour fourni.');
    }

    // Champs autorisés avec validation
    const allowedFields = ['name', 'email', 'phone', 'department'];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return badRequest(res, `Champs invalides: ${invalidFields.join(', ')}. Champs autorisés: ${allowedFields.join(', ')}`);
    }

    // Validation spécifique des champs
    if (updates.name) {
      if (typeof updates.name !== 'string') {
        return badRequest(res, 'Le nom doit être une chaîne de caractères.');
      }
      const trimmedName = updates.name.trim();
      if (trimmedName.length < 2) {
        return badRequest(res, 'Le nom doit contenir au moins 2 caractères.');
      }
      if (trimmedName.length > 100) {
        return badRequest(res, 'Le nom ne peut pas dépasser 100 caractères.');
      }
      updates.name = trimmedName;
    }

    if (updates.email && typeof updates.email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email.trim())) {
        return badRequest(res, 'Format d\'email invalide.');
      }
      updates.email = updates.email.trim();
    }

    if (updates.phone && typeof updates.phone === 'string') {
      if (updates.phone.trim().length > 20) {
        return badRequest(res, 'Le numéro de téléphone ne peut pas dépasser 20 caractères.');
      }
      updates.phone = updates.phone.trim();
    }

    if (updates.department && typeof updates.department === 'string') {
      updates.department = updates.department.trim();
    }

    // Vérifier disponibilité PostgreSQL SEULEMENT
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);

    // -------- VÉRIFICATION EXISTENCE INSTRUCTEUR --------
    console.log(`🔄 Recherche de l'instructeur à patcher - ID: ${id}`);
    const pgInstructor = await pgRepo.findOne({ where: { id } });

    if (!pgInstructor) {
      console.warn(`⚠️ Tentative de modification d'un instructeur inexistant - ID: ${id}`);
      return notFound(res, `Instructeur avec l'ID "${id}" introuvable.`);
    }

    // -------- VÉRIFICATION DOUBLON NOM --------
    if (updates.name && updates.name !== pgInstructor.name) {
      const existingWithSameName = await pgRepo.findOne({ 
        where: { name: updates.name } 
      });
      
      if (existingWithSameName && existingWithSameName.id !== id) {
        console.warn(`⚠️ Conflit de nom lors du patch - ID: ${id}, Nom: "${updates.name}"`);
        return conflict(res, `Un autre instructeur avec le nom "${updates.name}" existe déjà.`);
      }
    }

    // -------- SAUVEGARDE ANCIEN NOM POUR LOGS --------
    const oldName = pgInstructor.name;

    // -------- MISE À JOUR POSTGRESQL --------
    console.log(`🔄 Patch PostgreSQL - ID: ${id}`);
    pgRepo.merge(pgInstructor, updates);
    const updatedPgInstructor = await pgRepo.save(pgInstructor);
    console.log(`✅ Instructeur patché - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Instructeur modifié avec succès - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: 'Instructeur modifié avec succès',
      data: updatedPgInstructor,
      details: {
        id,
        oldName,
        newName: updates.name || oldName,
        updatedFields: Object.keys(updates),
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la modification de l\'instructeur:', err);
    
    if (isDatabaseError(err) && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Un autre instructeur avec ce nom existe déjà',
        error: 'DUPLICATE_INSTRUCTOR_NAME'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la modification de l\'instructeur - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   DELETE INSTRUCTOR (PostgreSQL seulement)
// -------------------------------------------------------
export async function deleteInstructor(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // -------- VÉRIFICATION DISPONIBILITÉ POSTGRESQL --------
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données PostgreSQL non accessible');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);

    // -------- VÉRIFICATION EXISTENCE INSTRUCTEUR --------
    console.log(`🔄 Recherche de l'instructeur à supprimer - ID: ${id}`);
    const pgInstructor = await pgRepo.findOne({ 
      where: { id },
      relations: ['courses', 'places'] // Vérifier les relations avant suppression
    });

    if (!pgInstructor) {
      console.warn(`⚠️ Tentative de suppression d'un instructeur inexistant - ID: ${id}`);
      return notFound(res, `Instructeur avec l'ID "${id}" introuvable. Aucune action effectuée.`);
    }

    // -------- SAUVEGARDE INFOS POUR LOGS --------
    const instructorName = pgInstructor.name;

    // -------- VÉRIFICATION CONTRAINTES RÉFÉRENTIELLES --------
    if (pgInstructor.courses && pgInstructor.courses.length > 0) {
      const courseCount = pgInstructor.courses.length;
      console.warn(`⚠️ Tentative de suppression d'un instructeur avec cours associés - ID: ${id}, Cours: ${courseCount}`);
      return res.status(409).json({
        success: false,
        message: `Impossible de supprimer cet instructeur car il est associé à ${courseCount} cours`,
        error: 'INSTRUCTOR_IN_USE_COURSES',
        details: {
          associatedCourses: courseCount,
          instructorName: instructorName,
          suggestion: 'Réassignez ou supprimez d\'abord les cours associés avant de supprimer l\'instructeur'
        }
      });
    }

    if (pgInstructor.places && pgInstructor.places.length > 0) {
      const placeCount = pgInstructor.places.length;
      console.warn(`⚠️ Tentative de suppression d'un instructeur avec bureaux associés - ID: ${id}, Bureaux: ${placeCount}`);
      return res.status(409).json({
        success: false,
        message: `Impossible de supprimer cet instructeur car il est associé à ${placeCount} bureau(x)`,
        error: 'INSTRUCTOR_IN_USE_OFFICES',
        details: {
          associatedOffices: placeCount,
          instructorName: instructorName,
          suggestion: 'Réassignez d\'abord les bureaux associés avant de supprimer l\'instructeur'
        }
      });
    }

    // -------- SUPPRESSION POSTGRESQL --------
    console.log(`🔄 Suppression de l'instructeur - ID: ${id}, Nom: "${instructorName}"`);
    await pgRepo.remove(pgInstructor);
    console.log(`✅ Instructeur supprimé - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Instructeur supprimé avec succès - ID: ${id}, Nom: "${instructorName}"`);

    return res.status(200).json({
      success: true,
      message: `Instructeur "${instructorName}" supprimé avec succès`,
      details: {
        id,
        name: instructorName,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la suppression de l\'instructeur:', err);
    
    // Gestion spécifique des erreurs de contrainte référentielle
    if (isDatabaseError(err) && (err.code === '23503' || getErrorMessage(err).includes('foreign key constraint'))) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer cet instructeur car il est référencé dans d\'autres tables',
        error: 'FOREIGN_KEY_CONSTRAINT',
        details: {
          suggestion: 'Vérifiez et supprimez d\'abord toutes les références à cet instructeur'
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la suppression de l\'instructeur - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}
// -------------------------------------------------------
//   GET INSTRUCTOR COURSES
// -------------------------------------------------------
export async function getInstructorCourses(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // Vérifier disponibilité PostgreSQL
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'PostgreSQL requis pour récupérer les cours de l\'instructeur');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['courses', 'courses.place', 'courses.place.category']
    });

    if (!instructor) {
      return notFound(res, 'Instructeur non trouvé');
    }

    const courses = instructor.courses || [];
    
    console.log(`✅ ${courses.length} cours récupérés pour l'instructeur - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: `Liste des cours récupérée avec succès (${courses.length} éléments)`,
      data: courses,
      count: courses.length,
      instructor: {
        id: instructor.id,
        name: instructor.name
      }
    });
  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération des cours de l\'instructeur:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des cours de l\'instructeur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}

// -------------------------------------------------------
//   GET INSTRUCTOR OFFICE
// -------------------------------------------------------
export async function getInstructorOffice(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'instructeur invalide.');
    }

    // Vérifier disponibilité PostgreSQL
    if (!pgDataSource?.isInitialized) {
      return serviceUnavailable(res, 'PostgreSQL requis pour récupérer le bureau de l\'instructeur');
    }

    const pgRepo = pgDataSource.getRepository(Instructor);
    const instructor = await pgRepo.findOne({
      where: { id },
      relations: ['places', 'places.category'] // CORRECTION: 'places' au lieu de 'office'
    });

    if (!instructor) {
      return notFound(res, 'Instructeur non trouvé');
    }

    const offices = instructor.places || [];
    
    if (offices.length === 0) {
      console.log(`ℹ️ Aucun bureau trouvé pour l'instructeur - ID: ${id}`);
      return res.status(200).json({
        success: true,
        message: 'Aucun bureau assigné à cet instructeur',
        data: [],
        count: 0
      });
    }

    console.log(`✅ ${offices.length} bureau(x) trouvé(s) pour l'instructeur - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: `Bureau(s) récupéré(s) avec succès (${offices.length} élément(s))`,
      data: offices,
      count: offices.length,
      instructor: {
        id: instructor.id,
        name: instructor.name
      }
    });
  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération du bureau de l\'instructeur:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du bureau de l\'instructeur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}