import { Request, Response } from 'express';
import { pgDataSource } from '../loaders/database';
import { Schedule } from '../models/Schedule';
import { Course } from '../models/Course';
import { Place } from '../models/Place';
import { Instructor } from '../models/Instructor';
import { 
  badRequest, 
  conflict, 
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
//   FONCTION UTILITAIRE : Vérifie si PostgreSQL est disponible
// -------------------------------------------------------
async function isPostgreSQLAvailable(): Promise<boolean> {
  try {
    if (!pgDataSource?.isInitialized) {
      return false;
    }
    
    await pgDataSource.query('SELECT 1');
    return true;
  } catch (error) {
    console.warn('PostgreSQL not available for schedules');
    return false;
  }
}

// -------------------------------------------------------
//   VALIDATIONS AVANCÉES
// -------------------------------------------------------

/**
 * Validation de base du cours (salle et professeur)
 */
function validateCourseRequirements(course: Course): { isValid: boolean; message?: string } {
  if (!course.place) {
    return {
      isValid: false,
      message: 'Impossible de programmer un cours sans salle assignée. Veuillez d\'abord assigner une salle au cours.'
    };
  }

  if (!course.instructor) {
    return {
      isValid: false,
      message: 'Impossible de programmer un cours sans professeur assigné. Veuillez d\'abord assigner un professeur au cours.'
    };
  }

  return { isValid: true };
}

/**
 * Validation de la capacité de la salle
 */
async function validateRoomCapacity(courseId: string): Promise<{ isValid: boolean; message?: string }> {
  try {
    const courseRepo = pgDataSource!.getRepository(Course);
    
    const course = await courseRepo.findOne({
      where: { id: courseId },
      relations: ['place']
    });

    if (!course?.place) {
      return { isValid: false, message: 'Salle non trouvée pour ce cours' };
    }

    // Ici vous pourriez vérifier la capacité de la salle vs le nombre d'étudiants
    // Pour l'instant, on suppose que c'est validé ailleurs
    return { isValid: true };
  } catch (error) {
    console.error('Erreur lors de la validation de la capacité de la salle:', error);
    return { isValid: true }; // On ne bloque pas si cette vérification échoue
  }
}

/**
 * Validation de la disponibilité du professeur
 */
async function validateInstructorAvailability(
  instructorId: string, 
  startAt: Date, 
  endAt: Date, 
  excludeScheduleId?: string
): Promise<{ isValid: boolean; message?: string }> {
  try {
    const scheduleRepo = pgDataSource!.getRepository(Schedule);
    
    const query = scheduleRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .leftJoinAndSelect('course.place', 'place')
      .where('instructor.id = :instructorId', { instructorId })
      .andWhere('(schedule.startAt, schedule.endAt) OVERLAPS (:startAt, :endAt)', {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });

    if (excludeScheduleId) {
      query.andWhere('schedule.id != :excludeScheduleId', { excludeScheduleId });
    }

    const conflictingSchedule = await query.getOne();

    if (conflictingSchedule) {
      return {
        isValid: false,
        message: `Le professeur est déjà occupé avec le cours "${conflictingSchedule.course.title}" en salle "${conflictingSchedule.course.place?.name || 'Non assignée'}" sur cette plage horaire.`
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Erreur lors de la validation de la disponibilité du professeur:', error);
    return { isValid: false, message: 'Erreur lors de la vérification de la disponibilité du professeur' };
  }
}

/**
 * Validation de la disponibilité de la salle
 */
async function validateRoomAvailability(
  roomId: string, 
  startAt: Date, 
  endAt: Date, 
  excludeScheduleId?: string
): Promise<{ isValid: boolean; message?: string }> {
  try {
    const scheduleRepo = pgDataSource!.getRepository(Schedule);
    
    const query = scheduleRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('course.place', 'place')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .where('place.id = :roomId', { roomId })
      .andWhere('(schedule.startAt, schedule.endAt) OVERLAPS (:startAt, :endAt)', {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });

    if (excludeScheduleId) {
      query.andWhere('schedule.id != :excludeScheduleId', { excludeScheduleId });
    }

    const conflictingSchedule = await query.getOne();

    if (conflictingSchedule) {
      return {
        isValid: false,
        message: `La salle est déjà occupée par le cours "${conflictingSchedule.course.title}" (Professeur: ${conflictingSchedule.course.instructor?.name || 'Non assigné'}) sur cette plage horaire.`
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Erreur lors de la validation de la disponibilité de la salle:', error);
    return { isValid: false, message: 'Erreur lors de la vérification de la disponibilité de la salle' };
  }
}

/**
 * Validation des conflits de cours
 */
async function validateCourseScheduleConflicts(
  courseId: string, 
  startAt: Date, 
  endAt: Date, 
  excludeScheduleId?: string
): Promise<{ isValid: boolean; message?: string }> {
  try {
    const scheduleRepo = pgDataSource!.getRepository(Schedule);
    
    const query = scheduleRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .where('schedule.courseId = :courseId', { courseId })
      .andWhere('(schedule.startAt, schedule.endAt) OVERLAPS (:startAt, :endAt)', {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });

    if (excludeScheduleId) {
      query.andWhere('schedule.id != :excludeScheduleId', { excludeScheduleId });
    }

    const conflictingSchedule = await query.getOne();

    if (conflictingSchedule) {
      return {
        isValid: false,
        message: 'Ce cours a déjà un emploi du temps programmé sur cette plage horaire.'
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Erreur lors de la validation des conflits de cours:', error);
    return { isValid: false, message: 'Erreur lors de la vérification des conflits de cours' };
  }
}

/**
 * Validation complète de la plage horaire
 */
function validateTimeRange(startAt: Date, endAt: Date, isUpdate: boolean = false): { isValid: boolean; message?: string } {
  const now = new Date();
  
  // Pour les créations, vérifier que la date de début est dans le futur
  if (!isUpdate && startAt < now) {
    return {
      isValid: false,
      message: 'La date de début doit être dans le futur. Impossible de programmer un cours dans le passé.'
    };
  }

  // Vérifier que la date de fin est après la date de début
  if (startAt >= endAt) {
    return {
      isValid: false,
      message: 'La date de début doit être antérieure à la date de fin.'
    };
  }

  // Vérifier la durée minimale (15 minutes)
  const durationMs = endAt.getTime() - startAt.getTime();
  const durationMinutes = durationMs / (1000 * 60);
  
  if (durationMinutes < 15) {
    return {
      isValid: false,
      message: 'La durée du cours doit être d\'au moins 15 minutes.'
    };
  }

  // Vérifier la durée maximale (4 heures pour un cours standard)
  if (durationMinutes > 4 * 60) {
    return {
      isValid: false,
      message: 'La durée du cours ne peut pas dépasser 4 heures pour une session.'
    };
  }

  return { isValid: true };
}

/**
 * Validation des heures de travail (8h-20h)
 */
function validateWorkingHours(startAt: Date, endAt: Date): { isValid: boolean; message?: string } {
  const startHour = startAt.getHours();
  const startMinutes = startAt.getMinutes();
  const endHour = endAt.getHours();
  const endMinutes = endAt.getMinutes();
  
  const startTime = startHour + startMinutes / 60;
  const endTime = endHour + endMinutes / 60;
  
  if (startTime < 8 || startTime >= 20) {
    return {
      isValid: false,
      message: 'Les cours doivent être programmés entre 8h et 20h.'
    };
  }

  if (endTime < 8 || endTime > 20) {
    return {
      isValid: false,
      message: 'Les cours doivent se terminer avant 20h.'
    };
  }

  // Vérifier que le cours ne commence pas trop tard pour finir avant 20h
  if (startTime > 19.25) { // 19h15
    return {
      isValid: false,
      message: 'Les cours ne peuvent pas commencer après 19h15 pour respecter l\'horaire de fin à 20h.'
    };
  }

  return { isValid: true };
}

/**
 * Validation des jours de semaine (lundi-samedi)
 * 
 */
function validateWeekdays(startAt: Date, endAt: Date): { isValid: boolean; message?: string } {
  const startDay = startAt.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
  const endDay = endAt.getDay();
  
  // Interdire seulement le dimanche
  if (startDay === 0) {
    return {
      isValid: false,
      message: 'Les cours ne peuvent pas être programmés le dimanche.'
    };
  }

  if (endDay === 0) {
    return {
      isValid: false,
      message: 'Les cours ne peuvent pas se terminer le dimanche.'
    };
  }

  return { isValid: true };
}

/**
 * Validation du même jour pour début et fin
 */
function validateSameDay(startAt: Date, endAt: Date): { isValid: boolean; message?: string } {
  const startDate = new Date(startAt).toDateString();
  const endDate = new Date(endAt).toDateString();
  
  if (startDate !== endDate) {
    return {
      isValid: false,
      message: 'Le cours doit commencer et se terminer le même jour. Les cours sur plusieurs jours ne sont pas autorisés.'
    };
  }

  return { isValid: true };
}

/**
 * Validation de la pause déjeuner (12h-14h)
 */
function validateLunchBreak(startAt: Date, endAt: Date): { isValid: boolean; message?: string } {
  const startTime = startAt.getHours() + startAt.getMinutes() / 60;
  const endTime = endAt.getHours() + endAt.getMinutes() / 60;
  
  // Vérifier si le cours chevauche la pause déjeuner
  if ((startTime < 14 && endTime > 12) && (startTime < 12 || endTime > 14)) {
    return {
      isValid: false,
      message: 'Les cours ne peuvent pas chevaucher la pause déjeuner (12h-14h).'
    };
  }

  return { isValid: true };
}

/**
 * Validation complète de tous les aspects
 */
async function validateCompleteSchedule(
  courseId: string, 
  startAt: Date, 
  endAt: Date, 
  excludeScheduleId?: string
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const courseRepo = pgDataSource!.getRepository(Course);
    const course = await courseRepo.findOne({ 
      where: { id: courseId },
      relations: ['place', 'instructor']
    });

    if (!course) {
      errors.push('Cours introuvable.');
      return { isValid: false, errors };
    }

    // Validation des prérequis du cours
    const courseValidation = validateCourseRequirements(course);
    if (!courseValidation.isValid) {
      errors.push(courseValidation.message!);
    }

    // Validations temporelles
    const timeValidation = validateTimeRange(startAt, endAt, !!excludeScheduleId);
    if (!timeValidation.isValid) {
      errors.push(timeValidation.message!);
    }

    const workingHoursValidation = validateWorkingHours(startAt, endAt);
    if (!workingHoursValidation.isValid) {
      errors.push(workingHoursValidation.message!);
    }

    const weekdaysValidation = validateWeekdays(startAt, endAt);
    if (!weekdaysValidation.isValid) {
      errors.push(weekdaysValidation.message!);
    }

    const sameDayValidation = validateSameDay(startAt, endAt);
    if (!sameDayValidation.isValid) {
      errors.push(sameDayValidation.message!);
    }

    const lunchBreakValidation = validateLunchBreak(startAt, endAt);
    if (!lunchBreakValidation.isValid) {
      errors.push(lunchBreakValidation.message!);
    }

    // Si le cours a des prérequis valides, vérifier les disponibilités
    if (courseValidation.isValid && course.place && course.instructor) {
      const roomAvailability = await validateRoomAvailability(course.place.id, startAt, endAt, excludeScheduleId);
      if (!roomAvailability.isValid) {
        errors.push(roomAvailability.message!);
      }

      const instructorAvailability = await validateInstructorAvailability(course.instructor.id, startAt, endAt, excludeScheduleId);
      if (!instructorAvailability.isValid) {
        errors.push(instructorAvailability.message!);
      }

      const courseConflicts = await validateCourseScheduleConflicts(courseId, startAt, endAt, excludeScheduleId);
      if (!courseConflicts.isValid) {
        errors.push(courseConflicts.message!);
      }

      const roomCapacity = await validateRoomCapacity(courseId);
      if (!roomCapacity.isValid) {
        errors.push(roomCapacity.message!);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Erreur lors de la validation complète:', error);
    errors.push('Erreur lors de la validation des contraintes.');
    return { isValid: false, errors };
  }
}

// -------------------------------------------------------
//   LIST SCHEDULES
// -------------------------------------------------------
export async function listSchedules(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);
    const schedules = await pgRepo.find({
      relations: ['course', 'course.place', 'course.instructor'],
      order: { startAt: 'ASC' }
    });
    
    console.log(`✅ ${schedules.length} emplois du temps récupérés`);
    return res.status(200).json({
      success: true,
      message: `Liste des emplois du temps récupérée avec succès (${schedules.length} éléments)`,
      data: schedules,
      count: schedules.length
    });
  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération des emplois du temps:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur lors de la récupération des emplois du temps',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}

// -------------------------------------------------------
//   CREATE SCHEDULE
// -------------------------------------------------------
export async function createSchedule(req: Request, res: Response) {
  try {
    const { courseId, startAt, endAt, recurrence } = req.body;

    // -------- VALIDATIONS DE BASE --------
    if (!courseId || typeof courseId !== 'string') {
      return badRequest(res, 'L\'ID du cours est requis et doit être une chaîne de caractères valide.');
    }

    if (!startAt || !endAt) {
      return badRequest(res, 'Les dates de début et de fin sont requises.');
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return badRequest(res, 'Les dates de début et de fin doivent être des dates valides.');
    }

    // Vérifier disponibilité PostgreSQL
    const postgresAvailable = await isPostgreSQLAvailable();
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    // -------- VALIDATION COMPLÈTE --------
    console.log(`🔄 Validation complète pour la création d'emploi du temps - Cours: ${courseId}`);
    
    const validation = await validateCompleteSchedule(courseId, startDate, endDate);
    if (!validation.isValid) {
      console.warn(`❌ Validation échouée: ${validation.errors.join(', ')}`);
      return badRequest(res, `Impossible de créer l'emploi du temps: ${validation.errors.join(' ')}`);
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);
    const courseRepo = pgDataSource!.getRepository(Course);

    // Récupérer le cours pour les logs
    const course = await courseRepo.findOne({ 
      where: { id: courseId },
      relations: ['place', 'instructor']
    });

    if (!course) {
      return notFound(res, `Cours avec l'ID "${courseId}" introuvable.`);
    }

    // -------- CRÉATION EMPLOI DU TEMPS --------
    console.log(`🔄 Création d'un nouvel emploi du temps pour: ${course.title}`);
    
    const schedule = pgRepo.create({
      course: { id: courseId },
      startAt: startDate,
      endAt: endDate,
      recurrence: recurrence || null
    });

    const savedSchedule = await pgRepo.save(schedule);
    console.log(`✅ Emploi du temps créé - ID: ${savedSchedule.id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    return res.status(201).json({
      success: true,
      message: 'Emploi du temps créé avec succès',
      data: savedSchedule,
      details: {
        id: savedSchedule.id,
        course: course.title,
        instructor: course.instructor?.name || 'Non assigné',
        place: course.place?.name || 'Non assignée',
        startAt: savedSchedule.startAt,
        endAt: savedSchedule.endAt,
        duration: Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)) + ' minutes',
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la création de l\'emploi du temps:', err);
    
    if (isDatabaseError(err) && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Un emploi du temps existe déjà pour cette plage horaire',
        error: 'DUPLICATE_SCHEDULE'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la création de l\'emploi du temps - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   UPDATE SCHEDULE
// -------------------------------------------------------
export async function updateSchedule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { courseId, startAt, endAt, recurrence } = req.body;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'emploi du temps invalide.');
    }

    // -------- VALIDATIONS CHAMPS --------
    if (!startAt || !endAt) {
      return badRequest(res, 'Les dates de début et de fin sont requises.');
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return badRequest(res, 'Les dates de début et de fin doivent être des dates valides.');
    }

    // Vérifier disponibilité PostgreSQL
    const postgresAvailable = await isPostgreSQLAvailable();
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);
    const courseRepo = pgDataSource!.getRepository(Course);

    // -------- VÉRIFICATION EXISTENCE EMPLOI DU TEMPS --------
    console.log(`🔄 Recherche de l'emploi du temps à mettre à jour - ID: ${id}`);
    const schedule = await pgRepo.findOne({
      where: { id },
      relations: ['course', 'course.place', 'course.instructor']
    });

    if (!schedule) {
      console.warn(`⚠️ Tentative de mise à jour d'un emploi du temps inexistant - ID: ${id}`);
      return notFound(res, `Emploi du temps avec l'ID "${id}" introuvable.`);
    }

    // -------- DÉTERMINATION DU COURS CIBLE --------
    let targetCourseId = courseId || schedule.course.id;
    let targetCourse = schedule.course;

    if (courseId && courseId !== schedule.course.id) {
      const newCourse = await courseRepo.findOne({ 
        where: { id: courseId },
        relations: ['place', 'instructor']
      });
      if (!newCourse) {
        return notFound(res, `Cours avec l'ID "${courseId}" introuvable.`);
      }
      targetCourse = newCourse;
      targetCourseId = courseId;
    }

    // -------- VALIDATION COMPLÈTE --------
    console.log(`🔄 Validation complète pour la mise à jour - ID: ${id}`);
    
    const validation = await validateCompleteSchedule(targetCourseId, startDate, endDate, id);
    if (!validation.isValid) {
      console.warn(`❌ Validation échouée pour la mise à jour: ${validation.errors.join(', ')}`);
      return badRequest(res, `Impossible de mettre à jour l'emploi du temps: ${validation.errors.join(' ')}`);
    }

    // -------- MISE À JOUR --------
    console.log(`🔄 Mise à jour de l'emploi du temps - ID: ${id}`);
    
    pgRepo.merge(schedule, {
      startAt: startDate,
      endAt: endDate,
      recurrence: recurrence !== undefined ? recurrence : schedule.recurrence
    });

    // Mise à jour du cours si nécessaire
    if (courseId && courseId !== schedule.course.id) {
      schedule.course = targetCourse;
    }

    const updatedSchedule = await pgRepo.save(schedule);
    console.log(`✅ Emploi du temps mis à jour - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    return res.status(200).json({
      success: true,
      message: 'Emploi du temps mis à jour avec succès',
      data: updatedSchedule,
      details: {
        id,
        course: targetCourse.title,
        instructor: targetCourse.instructor?.name || 'Non assigné',
        place: targetCourse.place?.name || 'Non assignée',
        startAt: updatedSchedule.startAt,
        endAt: updatedSchedule.endAt,
        duration: Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)) + ' minutes',
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la mise à jour de l\'emploi du temps:', err);
    
    if (isDatabaseError(err) && err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Un autre emploi du temps existe déjà pour cette plage horaire',
        error: 'DUPLICATE_SCHEDULE'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la mise à jour de l\'emploi du temps - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   DELETE SCHEDULE
// -------------------------------------------------------
export async function deleteSchedule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'emploi du temps invalide.');
    }

    // Vérifier disponibilité PostgreSQL
    const postgresAvailable = await isPostgreSQLAvailable();
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);

    // -------- VÉRIFICATION EXISTENCE EMPLOI DU TEMPS --------
    console.log(`🔄 Recherche de l'emploi du temps à supprimer - ID: ${id}`);
    const schedule = await pgRepo.findOne({
      where: { id },
      relations: ['course']
    });

    if (!schedule) {
      console.warn(`⚠️ Tentative de suppression d'un emploi du temps inexistant - ID: ${id}`);
      return notFound(res, `Emploi du temps avec l'ID "${id}" introuvable.`);
    }

    const now = new Date();

    // -------- VALIDATIONS DE SUPPRESSION --------
    if (schedule.endAt < now) {
      console.warn(`⚠️ Tentative de suppression d'un emploi du temps passé - ID: ${id}`);
      return badRequest(res, 'Impossible de supprimer un emploi du temps déjà terminé.');
    }

    if (schedule.startAt < now && schedule.endAt > now) {
      console.warn(`⚠️ Tentative de suppression d'un emploi du temps en cours - ID: ${id}`);
      return badRequest(res, 'Impossible de supprimer un emploi du temps en cours. Veuillez attendre la fin du cours.');
    }

    // Empêcher la suppression moins d'1 heure avant le début du cours
    const timeUntilStart = schedule.startAt.getTime() - now.getTime();
    const oneHourMs = 60 * 60 * 1000;
    
    if (timeUntilStart < oneHourMs && timeUntilStart > 0) {
      console.warn(`⚠️ Tentative de suppression moins d'1h avant le cours - ID: ${id}`);
      return badRequest(res, 'Impossible de supprimer un emploi du temps moins d\'une heure avant son début.');
    }

    // -------- SUPPRESSION --------
    console.log(`🔄 Suppression de l'emploi du temps - ID: ${id}, Cours: "${schedule.course.title}"`);
    await pgRepo.remove(schedule);
    console.log(`✅ Emploi du temps supprimé - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    return res.status(200).json({
      success: true,
      message: 'Emploi du temps supprimé avec succès',
      details: {
        id,
        course: schedule.course.title,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la suppression de l\'emploi du temps:', err);
    
    if (isDatabaseError(err) && (err.code === '23503' || getErrorMessage(err).includes('foreign key constraint'))) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer cet emploi du temps car il est référencé dans d\'autres données du système',
        error: 'FOREIGN_KEY_CONSTRAINT',
        details: {
          suggestion: 'Vérifiez et supprimez d\'abord toutes les références à cet emploi du temps'
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la suppression de l\'emploi du temps - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   SCHEDULES NOW (en cours actuellement)
// -------------------------------------------------------
export async function schedulesNow(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);
    const now = new Date();
    
    const schedules = await pgRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('course.place', 'place')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .leftJoinAndSelect('place.category', 'category')
      .where('schedule.startAt <= :now AND schedule.endAt >= :now', { 
        now: now.toISOString() 
      })
      .orderBy('schedule.startAt', 'ASC')
      .getMany();

    console.log(`✅ ${schedules.length} emplois du temps en cours récupérés`);
    return res.status(200).json({
      success: true,
      message: `Liste des emplois du temps en cours récupérée avec succès (${schedules.length} éléments)`,
      data: schedules,
      count: schedules.length,
      currentTime: now.toISOString()
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération des emplois du temps en cours:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des emplois du temps en cours',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}

// -------------------------------------------------------
//   GET SCHEDULE BY ID
// -------------------------------------------------------
export async function getScheduleById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID d\'emploi du temps invalide.');
    }

    const postgresAvailable = await isPostgreSQLAvailable();
    if (!postgresAvailable) {
      return serviceUnavailable(res, 'Service temporairement indisponible - Base de données non accessible');
    }

    const pgRepo = pgDataSource!.getRepository(Schedule);
    const schedule = await pgRepo.findOne({
      where: { id },
      relations: ['course', 'course.place', 'course.instructor', 'course.place.category']
    });

    if (!schedule) {
      console.warn(`⚠️ Emploi du temps non trouvé - ID: ${id}`);
      return notFound(res, `Emploi du temps avec l'ID "${id}" introuvable.`);
    }

    console.log(`✅ Emploi du temps récupéré - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: 'Emploi du temps récupéré avec succès',
      data: schedule
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération de l\'emploi du temps:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'emploi du temps',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}