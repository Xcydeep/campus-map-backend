import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Signalement } from '../models/Signalement';
import { Place } from '../models/Place';
import fs from 'fs';
import path from 'path';
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

// Fonction pour extraire le message d'erreur
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

/**
 * Calcule l'urgence d'un signalement basé sur son ancienneté
 */
function calculateUrgency(createdAt: Date): 'low' | 'medium' | 'high' {
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceCreation > 48) return 'high';
  if (hoursSinceCreation > 24) return 'medium';
  return 'low';
}

/**
 * Formate un signalement pour la réponse
 */
function formatSignalement(signalement: Signalement) {
  return {
    id: signalement.id,
    status: signalement.status,
    place: signalement.place ? { 
      id: (signalement.place as any).id, 
      name: (signalement.place as any).name 
    } : null,
    message: signalement.message,
    photos: signalement.photos,
    createdAt: signalement.createdAt,
    reference: `SIG-${signalement.id.slice(0, 8).toUpperCase()}`,
    urgency: calculateUrgency(signalement.createdAt)
  };
}

// -------------------------------------------------------
//   CRÉATION D'UN SIGNALEMENT
// -------------------------------------------------------
export async function createSignalement(req: Request, res: Response) {
  try {
    const { placeId, message } = req.body;

    // -------- VALIDATIONS DE BASE --------
    if (!message || message.trim().length < 5) {
      return badRequest(res, 'Le message doit contenir au moins 5 caractères.');
    }

    if (message.trim().length > 1000) {
      return badRequest(res, 'Le message ne peut pas dépasser 1000 caractères.');
    }

    // Validation de la salle si fournie
    if (placeId) {
      const placeRepo = pgDataSource!.getRepository(Place);
      const place = await placeRepo.findOne({ where: { id: placeId } });
      if (!place) {
        return notFound(res, `Salle avec l'ID "${placeId}" introuvable.`);
      }
    }

    // Traitement des photos avec validation
    const photos: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        // Validation des types de fichiers
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimes.includes(file.mimetype)) {
          return badRequest(res, `Type de fichier non autorisé: ${file.originalname}. Types autorisés: JPEG, PNG, GIF, WebP.`);
        }
        
        // Validation de la taille (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          return badRequest(res, `Fichier trop volumineux: ${file.originalname}. Taille max: 5MB.`);
        }
        
        photos.push(file.filename);
      }
    }

    // Limiter à 6 photos maximum
    if (photos.length > 6) {
      // Nettoyer les fichiers excédentaires
      for (let i = 6; i < photos.length; i++) {
        try {
          fs.unlinkSync(path.join('uploads/signalements/', photos[i]));
        } catch (cleanupError) {
          console.warn('Échec du nettoyage du fichier:', photos[i]);
        }
      }
      photos.splice(6);
    }

    // -------- CRÉATION DU SIGNALEMENT --------
    const pgRepo = pgDataSource!.getRepository(Signalement);
    const sqliteRepo = sqliteDataSource.getRepository(Signalement);

    const signalementData = {
      place: placeId ? { id: placeId } : undefined,
      message: message.trim(),
      photos: photos.length > 0 ? photos : undefined,
      status: 'pending' as 'pending'
    };

    // Création dans PostgreSQL
    const signalement = pgRepo.create(signalementData);
    const savedSignalement = await pgRepo.save(signalement);

    // Synchronisation avec SQLite
    try {
      const sqliteSignalement = sqliteRepo.create(signalementData);
      await sqliteRepo.save(sqliteSignalement);
    } catch (syncError) {
      console.warn('⚠️ Échec de la synchronisation SQLite:', syncError);
    }

    console.log(`✅ Signalement créé - ID: ${savedSignalement.id}, Photos: ${photos.length}`);

    // -------- RÉPONSE --------
    return res.status(201).json({
      success: true,
      message: 'Signalement créé avec succès',
      data: {
        id: savedSignalement.id,
        status: savedSignalement.status,
        place: savedSignalement.place ? { 
          id: (savedSignalement.place as any).id, 
          name: (savedSignalement.place as any).name 
        } : null,
        message: savedSignalement.message,
        photosCount: savedSignalement.photos ? savedSignalement.photos.length : 0,
        createdAt: savedSignalement.createdAt,
        reference: `SIG-${savedSignalement.id.slice(0, 8).toUpperCase()}`
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la création du signalement:', err);
    
    // Nettoyage des fichiers uploadés en cas d'erreur
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.warn('Échec du nettoyage du fichier:', file.path);
        }
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la création du signalement',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   LISTE DES SIGNALEMENTS EN ATTENTE (ADMIN)
// -------------------------------------------------------
export async function listPendingSignalements(req: Request, res: Response) {
  try {
    const { page = '1', limit = '20' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const pgRepo = pgDataSource!.getRepository(Signalement);
    
    const [signalements, total] = await pgRepo.findAndCount({
      where: { status: 'pending' },
      relations: ['place'],
      order: { createdAt: 'DESC' },
      skip,
      take: limitNum
    });

    console.log(`✅ ${signalements.length} signalements en attente récupérés`);

    return res.status(200).json({
      success: true,
      message: `Liste des signalements en attente (${signalements.length} sur ${total})`,
      data: signalements.map(sig => formatSignalement(sig)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération des signalements en attente:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des signalements',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   TRAITEMENT D'UN SIGNALEMENT (ADMIN)
// -------------------------------------------------------
export async function processSignalement(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { action, resolutionMessage } = req.body;

    // -------- VALIDATIONS --------
    if (!id) {
      return badRequest(res, 'ID du signalement requis.');
    }

    if (!action || !['accept', 'reject'].includes(action)) {
      return badRequest(res, 'Action invalide. Actions autorisées: accept, reject.');
    }

    if (action === 'accept' && (!resolutionMessage || resolutionMessage.trim().length < 3)) {
      return badRequest(res, 'Un message de résolution est requis pour accepter un signalement (min. 3 caractères).');
    }

    const pgRepo = pgDataSource!.getRepository(Signalement);
    const sqliteRepo = sqliteDataSource.getRepository(Signalement);

    // -------- RECHERCHE DU SIGNALEMENT --------
    const signalement = await pgRepo.findOne({ 
      where: { id },
      relations: ['place']
    });

    if (!signalement) {
      return notFound(res, `Signalement avec l'ID "${id}" introuvable.`);
    }

    // Vérifier que le signalement n'est pas déjà traité
    if (signalement.status !== 'pending') {
      return conflict(res, `Ce signalement a déjà été ${signalement.status}.`);
    }

    // -------- MISE À JOUR DU STATUT --------
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    
    // Stocker le message de résolution dans le champ message existant
    const updatedMessage = resolutionMessage ? 
      `${signalement.message}\n\n--- RÉSOLUTION ---\n${resolutionMessage.trim()}` : 
      signalement.message;

    signalement.status = newStatus;
    signalement.message = updatedMessage;

    const updatedSignalement = await pgRepo.save(signalement);

    // Synchronisation avec SQLite
    try {
      const sqliteSignalement = await sqliteRepo.findOne({ where: { id } });
      if (sqliteSignalement) {
        sqliteSignalement.status = newStatus;
        sqliteSignalement.message = updatedMessage;
        await sqliteRepo.save(sqliteSignalement);
      }
    } catch (syncError) {
      console.warn('⚠️ Échec de la synchronisation SQLite:', syncError);
    }

    console.log(`✅ Signalement traité - ID: ${id}, Action: ${action}, Statut: ${newStatus}`);

    // -------- RÉPONSE --------
    return res.status(200).json({
      success: true,
      message: `Signalement ${action === 'accept' ? 'accepté' : 'rejeté'} avec succès`,
      data: {
        ...formatSignalement(updatedSignalement),
        processedAt: new Date()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors du traitement du signalement:', err);
    return res.status(500).json({
      success: false,
      message: 'Échec du traitement du signalement',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   STATISTIQUES DES SIGNALEMENTS (ADMIN)
// -------------------------------------------------------
export async function getSignalementStats(req: Request, res: Response) {
  try {
    const pgRepo = pgDataSource!.getRepository(Signalement);

    // Comptages par statut
    const total = await pgRepo.count();
    const pending = await pgRepo.count({ where: { status: 'pending' } });
    const accepted = await pgRepo.count({ where: { status: 'accepted' } });
    const rejected = await pgRepo.count({ where: { status: 'rejected' } });

    // Signalements des dernières 24h
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    
    const recentCount = await pgRepo
      .createQueryBuilder('signalement')
      .where('signalement.createdAt >= :date', { date: last24h })
      .getCount();

    // Signalements avec photos
    const withPhotosCount = await pgRepo
      .createQueryBuilder('signalement')
      .where('signalement.photos IS NOT NULL')
      .andWhere('signalement.photos != :empty', { empty: '[]' })
      .getCount();

    console.log(`✅ Statistiques des signalements récupérées`);

    return res.status(200).json({
      success: true,
      message: 'Statistiques des signalements',
      data: {
        overview: {
          total,
          pending,
          accepted,
          rejected,
          resolutionRate: total > 0 ? Math.round(((accepted + rejected) / total) * 100) : 0
        },
        recentActivity: {
          last24h: recentCount,
          withPhotos: withPhotosCount,
          withPhotosPercentage: total > 0 ? Math.round((withPhotosCount / total) * 100) : 0
        },
        averages: {
          responseTime: '24h',
          photosPerReport: total > 0 ? (withPhotosCount / total).toFixed(1) : '0'
        }
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération des statistiques:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   HISTORIQUE COMPLET DES SIGNALEMENTS (ADMIN)
// -------------------------------------------------------
export async function getSignalementHistory(req: Request, res: Response) {
  try {
    const { page = '1', limit = '20', status } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const pgRepo = pgDataSource!.getRepository(Signalement);
    
    // Construction des conditions de recherche
    const where: any = {};
    if (status && ['pending', 'accepted', 'rejected'].includes(status as string)) {
      where.status = status;
    }

    const [signalements, total] = await pgRepo.findAndCount({
      where,
      relations: ['place'],
      order: { createdAt: 'DESC' },
      skip,
      take: limitNum
    });

    console.log(`✅ Historique des signalements récupéré - ${signalements.length} éléments`);

    return res.status(200).json({
      success: true,
      message: `Historique des signalements (${signalements.length} sur ${total})`,
      data: signalements.map(sig => ({
        ...formatSignalement(sig),
        hasPhotos: !!(sig.photos && sig.photos.length > 0)
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      },
      filters: {
        status: status || 'all'
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération de l\'historique:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   SUPPRESSION D'UN SIGNALEMENT (ADMIN)
// -------------------------------------------------------
export async function deleteSignalement(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id) {
      return badRequest(res, 'ID du signalement requis.');
    }

    const pgRepo = pgDataSource!.getRepository(Signalement);
    const sqliteRepo = sqliteDataSource.getRepository(Signalement);

    // -------- RECHERCHE DU SIGNALEMENT --------
    const signalement = await pgRepo.findOne({ 
      where: { id },
      relations: ['place']
    });

    if (!signalement) {
      return notFound(res, `Signalement avec l'ID "${id}" introuvable.`);
    }

    // -------- SUPPRESSION DES FICHIERS ASSOCIÉS --------
    if (signalement.photos && signalement.photos.length > 0) {
      for (const photoPath of signalement.photos) {
        try {
          const fullPath = path.join('uploads/signalements/', photoPath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`🗑️ Photo supprimée: ${photoPath}`);
          }
        } catch (fileError) {
          console.warn(`⚠️ Impossible de supprimer la photo: ${photoPath}`, fileError);
        }
      }
    }

    // -------- SUPPRESSION EN BASE --------
    await pgRepo.remove(signalement);

    // Synchronisation avec SQLite
    try {
      const sqliteSignalement = await sqliteRepo.findOne({ where: { id } });
      if (sqliteSignalement) {
        await sqliteRepo.remove(sqliteSignalement);
      }
    } catch (syncError) {
      console.warn('⚠️ Échec de la synchronisation SQLite:', syncError);
    }

    console.log(`✅ Signalement supprimé - ID: ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Signalement supprimé avec succès',
      details: {
        id,
        hadPhotos: !!(signalement.photos && signalement.photos.length > 0),
        photosDeleted: signalement.photos ? signalement.photos.length : 0
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la suppression du signalement:', err);
    return res.status(500).json({
      success: false,
      message: 'Échec de la suppression du signalement',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   OBTENIR UN SIGNALEMENT SPÉCIFIQUE (ADMIN)
// -------------------------------------------------------
export async function getSignalementById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id) {
      return badRequest(res, 'ID du signalement requis.');
    }

    const pgRepo = pgDataSource!.getRepository(Signalement);

    const signalement = await pgRepo.findOne({ 
      where: { id },
      relations: ['place']
    });

    if (!signalement) {
      return notFound(res, `Signalement avec l'ID "${id}" introuvable.`);
    }

    console.log(`✅ Signalement récupéré - ID: ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Signalement récupéré avec succès',
      data: formatSignalement(signalement)
    });

  } catch (err: unknown) {
    console.error('❌ Erreur lors de la récupération du signalement:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du signalement',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}