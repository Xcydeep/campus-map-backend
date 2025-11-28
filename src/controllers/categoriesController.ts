import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Category } from '../models/Category';
import { CategoryLite } from '../models/CategoryLite';
import { 
  badRequest, 
  conflict, 
  handleError, 
  notFound 
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
//   FONCTION UTILITAIRE : Vérifie si internet est ON
// -------------------------------------------------------
async function isOnline(): Promise<boolean> {
  try {
    // Utilisation d'AbortController pour le timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://dns.google/", { 
      method: 'HEAD',
      signal: controller.signal as any
    });
    
    clearTimeout(timeoutId);
    return response.status === 200;
  } catch {
    return false;
  }
}

// -------------------------------------------------------
//   LIST CATEGORIES (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function listCategories(req: Request, res: Response) {
  try {
    const online = await isOnline();

    // ONLINE → PostgreSQL
    if (online && pgDataSource?.isInitialized) {
      const repo = pgDataSource.getRepository(Category);
      const items = await repo.find({
        order: { name: 'ASC' }
      });
      
      console.log(`✅ ${items.length} catégories récupérées depuis PostgreSQL (Mode Online)`);
      return res.status(200).json({
        success: true,
        message: `Liste des catégories récupérée avec succès (${items.length} éléments)`,
        data: items,
        source: 'postgresql',
        count: items.length
      });
    }

    // OFFLINE → SQLite
    if (sqliteDataSource?.isInitialized) {
      const repoLite = sqliteDataSource.getRepository(CategoryLite);
      const itemsLite = await repoLite.find({
        order: { name: 'ASC' }
      });
      
      console.log(`✅ ${itemsLite.length} catégories récupérées depuis SQLite (Mode Offline)`);
      return res.status(200).json({
        success: true,
        message: `Liste des catégories récupérée avec succès (${itemsLite.length} éléments) - Mode Hors Ligne`,
        data: itemsLite,
        source: 'sqlite',
        count: itemsLite.length
      });
    }

    console.error('❌ Aucune base de données disponible pour récupérer les catégories');
    return res.status(503).json({
      success: false,
      message: 'Service temporairement indisponible - Bases de données non accessibles',
      data: [],
      source: 'none',
      count: 0
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la récupération des catégories:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur lors de la récupération des catégories',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined,
      data: []
    });
  }
}

// -------------------------------------------------------
//   CREATE CATEGORY (Toujours dans PG + SQLite)
// -------------------------------------------------------
export async function createCategory(req: Request, res: Response) {
  try {
    const { name } = req.body;

    // -------- VALIDATION RENFORCÉE --------
    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Le nom de la catégorie est requis et doit être une chaîne de caractères.');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return badRequest(res, 'Le nom de la catégorie doit contenir au moins 2 caractères.');
    }

    if (trimmedName.length > 50) {
      return badRequest(res, 'Le nom de la catégorie ne peut pas dépasser 50 caractères.');
    }

    // Vérification format du nom (lettres, chiffres, espaces, tirets)
    const nameRegex = /^[a-zA-ZÀ-ÿ0-9\s\-_]+$/;
    if (!nameRegex.test(trimmedName)) {
      return badRequest(res, 'Le nom de la catégorie contient des caractères non autorisés. Utilisez uniquement des lettres, chiffres, espaces, tirets et underscores.');
    }

    // -------- VÉRIFICATION DISPONIBILITÉ BASES --------
    if (!pgDataSource?.isInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Service temporairement indisponible - Base de données PostgreSQL non accessible'
      });
    }

    if (!sqliteDataSource?.isInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Service temporairement indisponible - Base de données SQLite non accessible'
      });
    }

    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(CategoryLite);

    // -------- VÉRIFICATION DOUBLON PG --------
    const existPg = await pgRepo.findOne({ where: { name: trimmedName } });
    if (existPg) {
      console.warn(`⚠️ Tentative de création d'une catégorie existante dans PostgreSQL: "${trimmedName}"`);
      return conflict(res, `La catégorie "${trimmedName}" existe déjà dans la base de données principale.`);
    }

    // -------- VÉRIFICATION DOUBLON SQLite --------
    const existLite = await sqliteRepo.findOne({ where: { name: trimmedName } });
    if (existLite) {
      console.warn(`⚠️ Tentative de création d'une catégorie existante dans SQLite: "${trimmedName}"`);
      return conflict(res, `La catégorie "${trimmedName}" existe déjà dans la base de données locale.`);
    }

    // -------- CRÉATION POSTGRESQL --------
    console.log(`🔄 Début de création de la catégorie: "${trimmedName}"`);
    const pgCategory = pgRepo.create({ name: trimmedName });
    const savedPg = await pgRepo.save(pgCategory);
    console.log(`✅ Catégorie créée dans PostgreSQL - ID: ${savedPg.id}`);

    // -------- RÉPLICATION DANS SQLite --------
    const liteCategory = sqliteRepo.create({
      id: savedPg.id,
      name: trimmedName
    });
    await sqliteRepo.save(liteCategory);
    console.log(`✅ Catégorie répliquée dans SQLite - ID: ${savedPg.id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Catégorie créée avec succès dans les deux bases: "${trimmedName}" (ID: ${savedPg.id})`);
    return res.status(201).json({
      success: true,
      message: `Catégorie "${trimmedName}" créée avec succès`,
      data: savedPg,
      details: {
        id: savedPg.id,
        name: savedPg.name,
        createdIn: ['postgresql', 'sqlite'],
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la création de la catégorie:', err);
    
    // Gestion spécifique des erreurs de contrainte unique
    if (isDatabaseError(err) && (err.code === '23505' || getErrorMessage(err).includes('unique constraint'))) {
      return res.status(409).json({
        success: false,
        message: 'Une catégorie avec ce nom existe déjà',
        error: 'DUPLICATE_CATEGORY'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la création de la catégorie - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   UPDATE CATEGORY (ONLINE ONLY → PG + SQLite)
// -------------------------------------------------------
export async function updateCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID de catégorie invalide.');
    }

    // -------- VALIDATION NOM --------
    if (!name || typeof name !== 'string') {
      return badRequest(res, 'Le nom de la catégorie est requis et doit être une chaîne de caractères.');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return badRequest(res, 'Le nom de la catégorie doit contenir au moins 2 caractères.');
    }

    if (trimmedName.length > 50) {
      return badRequest(res, 'Le nom de la catégorie ne peut pas dépasser 50 caractères.');
    }

    const nameRegex = /^[a-zA-ZÀ-ÿ0-9\s\-_]+$/;
    if (!nameRegex.test(trimmedName)) {
      return badRequest(res, 'Le nom de la catégorie contient des caractères non autorisés.');
    }

    // -------- VÉRIFICATION DISPONIBILITÉ BASES --------
    if (!pgDataSource?.isInitialized || !sqliteDataSource?.isInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Service temporairement indisponible - Les deux bases de données doivent être accessibles pour la mise à jour'
      });
    }

    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(CategoryLite);

    // -------- VÉRIFICATION EXISTENCE CATÉGORIE --------
    console.log(`🔄 Recherche de la catégorie à mettre à jour - ID: ${id}`);
    const [catPg, catLite] = await Promise.all([
      pgRepo.findOne({ where: { id } }),
      sqliteRepo.findOne({ where: { id } })
    ]);

    if (!catPg && !catLite) {
      console.warn(`⚠️ Tentative de mise à jour d'une catégorie inexistante - ID: ${id}`);
      return notFound(res, `Catégorie avec l'ID "${id}" introuvable dans les deux bases de données.`);
    }

    if (!catPg) {
      console.warn(`⚠️ Catégorie trouvée en SQLite mais pas en PostgreSQL - ID: ${id}`);
      return notFound(res, `Catégorie introuvable dans la base de données principale (PostgreSQL).`);
    }

    if (!catLite) {
      console.warn(`⚠️ Catégorie trouvée en PostgreSQL mais pas en SQLite - ID: ${id}`);
      return notFound(res, `Catégorie introuvable dans la base de données locale (SQLite).`);
    }

    // -------- VÉRIFICATION DOUBLON (autre catégorie avec même nom) --------
    const existingWithSameName = await pgRepo.findOne({ 
      where: { name: trimmedName } 
    });
    
    if (existingWithSameName && existingWithSameName.id !== id) {
      console.warn(`⚠️ Conflit de nom lors de la mise à jour - ID: ${id}, Nom: "${trimmedName}"`);
      return conflict(res, `Une autre catégorie avec le nom "${trimmedName}" existe déjà.`);
    }

    // -------- SAUVEGARDE ANCIEN NOM POUR LOGS --------
    const oldName = catPg.name;

    // -------- MISE À JOUR POSTGRESQL --------
    console.log(`🔄 Mise à jour PostgreSQL - ID: ${id}, Ancien: "${oldName}", Nouveau: "${trimmedName}"`);
    pgRepo.merge(catPg, { name: trimmedName });
    const updatedPg = await pgRepo.save(catPg);
    console.log(`✅ Catégorie mise à jour dans PostgreSQL - ID: ${id}`);

    // -------- MISE À JOUR SQLite --------
    console.log(`🔄 Mise à jour SQLite - ID: ${id}`);
    sqliteRepo.merge(catLite, { name: trimmedName });
    await sqliteRepo.save(catLite);
    console.log(`✅ Catégorie mise à jour dans SQLite - ID: ${id}`);

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Catégorie mise à jour avec succès - ID: ${id}`);
    return res.status(200).json({
      success: true,
      message: `Catégorie mise à jour avec succès de "${oldName}" vers "${trimmedName}"`,
      data: updatedPg,
      details: {
        id: updatedPg.id,
        oldName,
        newName: trimmedName,
        updatedIn: ['postgresql', 'sqlite'],
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la mise à jour de la catégorie:', err);
    
    if (isDatabaseError(err) && (err.code === '23505' || getErrorMessage(err).includes('unique constraint'))) {
      return res.status(409).json({
        success: false,
        message: 'Une autre catégorie avec ce nom existe déjà',
        error: 'DUPLICATE_CATEGORY_NAME'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la mise à jour de la catégorie - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}

// -------------------------------------------------------
//   DELETE CATEGORY (ONLINE ONLY → PG + SQLite)
// -------------------------------------------------------
export async function deleteCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // -------- VALIDATION ID --------
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'ID de catégorie invalide.');
    }

    // -------- VÉRIFICATION DISPONIBILITÉ BASES --------
    if (!pgDataSource?.isInitialized || !sqliteDataSource?.isInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Service temporairement indisponible - Les deux bases de données doivent être accessibles pour la suppression'
      });
    }

    const pgRepo = pgDataSource.getRepository(Category);
    const sqliteRepo = sqliteDataSource.getRepository(CategoryLite);

    // -------- VÉRIFICATION EXISTENCE CATÉGORIE --------
    console.log(`🔄 Recherche de la catégorie à supprimer - ID: ${id}`);
    const [catPg, catLite] = await Promise.all([
      pgRepo.findOne({ 
        where: { id },
        relations: ['places'] // Vérifier s'il y a des lieux associés
      }),
      sqliteRepo.findOne({ 
        where: { id },
        relations: ['places'] // Vérifier s'il y a des lieux associés en SQLite
      })
    ]);

    if (!catPg && !catLite) {
      console.warn(`⚠️ Tentative de suppression d'une catégorie inexistante - ID: ${id}`);
      return notFound(res, `Catégorie avec l'ID "${id}" introuvable. Aucune action effectuée.`);
    }

    // -------- VÉRIFICATION CONTRAINTES RÉFÉRENTIELLES --------
    if (catPg?.places && catPg.places.length > 0) {
      const placeCount = catPg.places.length;
      console.warn(`⚠️ Tentative de suppression d'une catégorie avec lieux associés - ID: ${id}, Lieux: ${placeCount}`);
      return res.status(409).json({
        success: false,
        message: `Impossible de supprimer cette catégorie car elle est utilisée par ${placeCount} lieu(x)`,
        error: 'CATEGORY_IN_USE',
        details: {
          associatedPlaces: placeCount,
          suggestion: 'Réassignez ou supprimez les lieux associés avant de supprimer la catégorie'
        }
      });
    }

    if (catLite?.places && catLite.places.length > 0) {
      const placeCount = catLite.places.length;
      console.warn(`⚠️ Catégorie avec lieux associés en SQLite - ID: ${id}, Lieux: ${placeCount}`);
      // On continue quand même la suppression mais on log un avertissement
      console.warn(`⚠️ Suppression de catégorie avec ${placeCount} lieu(x) associé(s) en SQLite`);
    }

    // -------- SAUVEGARDE INFOS POUR LOGS --------
    const categoryName = catPg?.name || catLite?.name || 'Inconnu';

    // -------- SUPPRESSION POSTGRESQL --------
    let pgDeleted = false;
    if (catPg) {
      console.log(`🔄 Suppression de la catégorie dans PostgreSQL - ID: ${id}, Nom: "${categoryName}"`);
      await pgRepo.remove(catPg);
      pgDeleted = true;
      console.log(`✅ Catégorie supprimée de PostgreSQL - ID: ${id}`);
    }

    // -------- SUPPRESSION SQLite --------
    let sqliteDeleted = false;
    if (catLite) {
      console.log(`🔄 Suppression de la catégorie dans SQLite - ID: ${id}`);
      await sqliteRepo.remove(catLite);
      sqliteDeleted = true;
      console.log(`✅ Catégorie supprimée de SQLite - ID: ${id}`);
    }

    // -------- RÉPONSE DE SUCCÈS --------
    console.log(`🎉 Catégorie supprimée avec succès - ID: ${id}, Nom: "${categoryName}"`);
    
    const deletionSummary = [];
    if (pgDeleted) deletionSummary.push('postgresql');
    if (sqliteDeleted) deletionSummary.push('sqlite');

    // CHOIX 1: Renvoyer un statut 200 avec les détails de la suppression
    return res.status(200).json({
      success: true,
      message: `Catégorie "${categoryName}" supprimée avec succès`,
      details: {
        id,
        name: categoryName,
        deletedFrom: deletionSummary,
        timestamp: new Date().toISOString()
      }
    });

    // CHOIX 2: Ou si vous préférez le statut 204 No Content (standard REST)
    // return res.status(204).send(); // Pas de body avec 204

  } catch (err: unknown) {
    console.error('❌ Erreur critique lors de la suppression de la catégorie:', err);
    
    // Gestion spécifique des erreurs de contrainte référentielle
    if (isDatabaseError(err) && (err.code === '23503' || getErrorMessage(err).includes('foreign key constraint'))) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer cette catégorie car elle est utilisée par un ou plusieurs lieux',
        error: 'FOREIGN_KEY_CONSTRAINT',
        details: {
          suggestion: 'Supprimez ou réassignez d\'abord tous les lieux associés à cette catégorie'
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Échec de la suppression de la catégorie - Erreur interne du serveur',
      error: process.env.NODE_ENV === 'development' ? getErrorMessage(err) : undefined
    });
  }
}