import { Request, Response } from 'express';
import { getRepository } from 'typeorm';
import { Place } from '../models/Place';
import { Category } from '../models/Category';
import { PlaceLite } from '../models/PlaceLite';
import { CategoryLite } from '../models/CategoryLite';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { badRequest, notFound, handleError } from '../utils/errorHandler';

// -------------------------------------------------------
//   FONCTION UTILITAIRE : Vérifie si PostgreSQL est disponible
// -------------------------------------------------------
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

// -------------------------------------------------------
//   FONCTIONS UTILITAIRES INTERNES
// -------------------------------------------------------

/**
 * Détermine le type de correspondance pour l'autocomplétion
 */
function getMatchType(placeName: string, query: string): 'exact' | 'partial' | 'fuzzy' {
  if (placeName.toLowerCase() === query.toLowerCase()) {
    return 'exact';
  }
  if (placeName.toLowerCase().startsWith(query.toLowerCase())) {
    return 'partial';
  }
  return 'fuzzy';
}

/**
 * Génère des suggestions de recherche intelligentes
 */
function generateSearchSuggestions(query: string, places: any[]): string[] {
  const suggestions: string[] = [];
  
  // Suggestions basées sur les résultats
  places.forEach(place => {
    if (place.category) {
      suggestions.push(`${place.category.name} ${query}`);
    }
    if (place.building) {
      suggestions.push(`${place.building} ${query}`);
    }
    if (place.capacity) {
      suggestions.push(`${query} capacité ${place.capacity}`);
    }
  });

  // Suggestions génériques
  const genericSuggestions = [
    `salle ${query}`,
    `bâtiment ${query}`,
    `étage ${query}`,
    `${query} capacité`,
    `${query} local`
  ];

  return [...new Set([...suggestions, ...genericSuggestions])].slice(0, 5);
}

/**
 * Formate les résultats PostgreSQL pour la réponse
 */
function formatPostgresPlaces(places: Place[]) {
  return places.map(place => ({
    id: place.id,
    name: place.name,
    description: place.description,
    capacity: place.capacity,
    building: place.building,
    floor: place.floor,
    code: place.code,
    category: place.category ? {
      id: place.category.id,
      name: place.category.name
    } : null,
    instructor: place.instructor ? {
      id: place.instructor.id,
      name: place.instructor.name
    } : null,
    photos: place.photos,
    location: place.latitude && place.longitude ? {
      latitude: place.latitude,
      longitude: place.longitude
    } : null,
    officeOwner: place.officeOwner
  }));
}

/**
 * Formate les résultats SQLite pour la réponse
 */
function formatSqlitePlaces(places: PlaceLite[]) {
  return places.map(place => ({
    id: place.id,
    name: place.name,
    description: null,
    capacity: null,
    building: null, // Propriété non disponible dans PlaceLite
    floor: null,    // Propriété non disponible dans PlaceLite
    code: null,     // Propriété non disponible dans PlaceLite
    category: place.category ? {
      id: place.category.id,
      name: place.category.name
    } : null,
    instructor: null,
    photos: null,
    location: place.latitude && place.longitude ? {
      latitude: place.latitude,
      longitude: place.longitude
    } : null,
    officeOwner: null
  }));
}

/**
 * Formate les données d'autocomplétion PostgreSQL
 */
function formatPostgresAutocomplete(places: Place[], query: string) {
  return places.map(place => ({
    id: place.id,
    name: place.name,
    code: place.code,
    building: place.building,
    floor: place.floor,
    category: place.category ? {
      name: place.category.name
    } : null,
    instructor: place.instructor ? {
      name: place.instructor.name
    } : null,
    capacity: place.capacity,
    matchType: getMatchType(place.name, query)
  }));
}

/**
 * Formate les données d'autocomplétion SQLite
 */
function formatSqliteAutocomplete(places: PlaceLite[], query: string) {
  return places.map(place => ({
    id: place.id,
    name: place.name,
    code: null,      // Propriété non disponible dans PlaceLite
    building: null,  // Propriété non disponible dans PlaceLite
    floor: null,     // Propriété non disponible dans PlaceLite
    category: place.category ? {
      name: place.category.name
    } : null,
    instructor: null,
    capacity: null,
    matchType: getMatchType(place.name, query)
  }));
}

// -------------------------------------------------------
//   RECHERCHE AVANCÉE DES SALLES (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function searchPlaces(req: Request, res: Response) {
  try {
    const { q, category, capacity, building, page = '1', limit = '20' } = req.query;

    // Validation de base
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return badRequest(res, 'Le terme de recherche doit contenir au moins 2 caractères.');
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const postgresAvailable = await isPostgreSQLAvailable();
    const searchTerm = `%${q.trim()}%`;

    if (postgresAvailable) {
      // RECHERCHE POSTGRESQL (ONLINE)
      const repo = getRepository(Place);
      
      // Construction de la requête
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .leftJoinAndSelect('place.instructor', 'instructor')
        .where('(place.name ILIKE :search OR place.description ILIKE :search OR place.code ILIKE :search)', {
          search: searchTerm
        })
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      // Filtre par catégorie
      if (category && typeof category === 'string') {
        queryBuilder.andWhere('category.name ILIKE :category', {
          category: `%${category}%`
        });
      }

      // Filtre par capacité
      if (capacity && !isNaN(Number(capacity))) {
        queryBuilder.andWhere('place.capacity >= :minCapacity', {
          minCapacity: parseInt(capacity as string)
        });
      }

      // Filtre par bâtiment
      if (building && typeof building === 'string') {
        queryBuilder.andWhere('place.building ILIKE :building', {
          building: `%${building}%`
        });
      }

      const [places, total] = await queryBuilder.getManyAndCount();

      console.log(`✅ Recherche PostgreSQL: "${q}" - ${places.length} résultats sur ${total}`);

      return res.status(200).json({
        success: true,
        message: `Recherche effectuée avec succès (${places.length} résultats)`,
        data: formatPostgresPlaces(places),
        search: {
          query: q.trim(),
          category: category || null,
          capacity: capacity || null,
          building: building || null
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        },
        source: 'postgresql'
      });

    } else {
      // RECHERCHE SQLITE (OFFLINE)
      const repo = sqliteDataSource.getRepository(PlaceLite);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .where('(place.name LIKE :search)', {
          search: searchTerm
        })
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      // Filtre par catégorie (SQLite)
      if (category && typeof category === 'string') {
        queryBuilder.andWhere('category.name LIKE :category', {
          category: `%${category}%`
        });
      }

      const [places, total] = await queryBuilder.getManyAndCount();

      console.log(`✅ Recherche SQLite: "${q}" - ${places.length} résultats sur ${total}`);

      return res.status(200).json({
        success: true,
        message: `Recherche effectuée avec succès (${places.length} résultats) - Mode Hors Ligne`,
        data: formatSqlitePlaces(places),
        search: {
          query: q.trim(),
          category: category || null,
          capacity: null, // Capacité non disponible en SQLite
          building: null  // Bâtiment non disponible en SQLite
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        },
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de la recherche:', err);
    return handleError(res, err, 'Erreur lors de la recherche');
  }
}

// -------------------------------------------------------
//   AUTOCOMPLÉTION INTELLIGENTE (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function autocompletePlaces(req: Request, res: Response) {
  try {
    const { q, category, building } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      return badRequest(res, 'Le terme de recherche est requis.');
    }

    const postgresAvailable = await isPostgreSQLAvailable();
    const searchTerm = `${q.trim()}%`;

    if (postgresAvailable) {
      // AUTOCOMPLÉTION POSTGRESQL
      const repo = getRepository(Place);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .leftJoinAndSelect('place.instructor', 'instructor')
        .where('(place.name ILIKE :search OR place.code ILIKE :search)', {
          search: searchTerm
        })
        .orderBy('place.name', 'ASC')
        .take(8);

      // Filtre par catégorie pour l'autocomplétion
      if (category && typeof category === 'string') {
        queryBuilder.andWhere('category.name ILIKE :category', {
          category: `%${category}%`
        });
      }

      // Filtre par bâtiment pour l'autocomplétion
      if (building && typeof building === 'string') {
        queryBuilder.andWhere('place.building ILIKE :building', {
          building: `%${building}%`
        });
      }

      const places = await queryBuilder.getMany();

      console.log(`✅ Autocomplétion PostgreSQL: "${q}" - ${places.length} suggestions`);

      return res.status(200).json({
        success: true,
        message: 'Suggestions de recherche récupérées',
        data: formatPostgresAutocomplete(places, q.trim()),
        suggestions: generateSearchSuggestions(q.trim(), places),
        source: 'postgresql'
      });

    } else {
      // AUTOCOMPLÉTION SQLITE
      const repo = sqliteDataSource.getRepository(PlaceLite);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .where('(place.name LIKE :search)', {
          search: searchTerm
        })
        .orderBy('place.name', 'ASC')
        .take(8);

      // Filtre par catégorie pour l'autocomplétion
      if (category && typeof category === 'string') {
        queryBuilder.andWhere('category.name LIKE :category', {
          category: `%${category}%`
        });
      }

      const places = await queryBuilder.getMany();

      console.log(`✅ Autocomplétion SQLite: "${q}" - ${places.length} suggestions`);

      return res.status(200).json({
        success: true,
        message: 'Suggestions de recherche récupérées - Mode Hors Ligne',
        data: formatSqliteAutocomplete(places, q.trim()),
        suggestions: generateSearchSuggestions(q.trim(), places),
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de l\'autocomplétion:', err);
    return handleError(res, err, 'Erreur lors de l\'autocomplétion');
  }
}

// -------------------------------------------------------
//   RECHERCHE PAR CATÉGORIE (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function searchByCategory(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const { page = '1', limit = '20', building, capacity } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const postgresAvailable = await isPostgreSQLAvailable();

    if (postgresAvailable) {
      // RECHERCHE PAR CATÉGORIE POSTGRESQL
      const repo = getRepository(Place);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .leftJoinAndSelect('place.instructor', 'instructor')
        .where('category.id = :categoryId', { categoryId })
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      // Filtre par bâtiment
      if (building && typeof building === 'string') {
        queryBuilder.andWhere('place.building ILIKE :building', {
          building: `%${building}%`
        });
      }

      // Filtre par capacité
      if (capacity && !isNaN(Number(capacity))) {
        queryBuilder.andWhere('place.capacity >= :minCapacity', {
          minCapacity: parseInt(capacity as string)
        });
      }

      const [places, total] = await queryBuilder.getManyAndCount();

      if (places.length === 0) {
        return notFound(res, 'Aucune salle trouvée pour cette catégorie.');
      }

      console.log(`✅ Recherche par catégorie PostgreSQL: ${categoryId} - ${places.length} résultats`);

      return res.status(200).json({
        success: true,
        message: `Salles de la catégorie (${places.length} résultats)`,
        data: formatPostgresPlaces(places),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        source: 'postgresql'
      });

    } else {
      // RECHERCHE PAR CATÉGORIE SQLITE
      const repo = sqliteDataSource.getRepository(PlaceLite);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .where('category.id = :categoryId', { categoryId })
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      const [places, total] = await queryBuilder.getManyAndCount();

      if (places.length === 0) {
        return notFound(res, 'Aucune salle trouvée pour cette catégorie.');
      }

      console.log(`✅ Recherche par catégorie SQLite: ${categoryId} - ${places.length} résultats`);

      return res.status(200).json({
        success: true,
        message: `Salles de la catégorie (${places.length} résultats) - Mode Hors Ligne`,
        data: formatSqlitePlaces(places),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de la recherche par catégorie:', err);
    return handleError(res, err, 'Erreur lors de la recherche par catégorie');
  }
}

// -------------------------------------------------------
//   RECHERCHE PAR BÂTIMENT (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function searchByBuilding(req: Request, res: Response) {
  try {
    const { building } = req.params;
    const { page = '1', limit = '20', category, capacity } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const postgresAvailable = await isPostgreSQLAvailable();

    if (postgresAvailable) {
      // RECHERCHE PAR BÂTIMENT POSTGRESQL
      const repo = getRepository(Place);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .leftJoinAndSelect('place.instructor', 'instructor')
        .where('place.building ILIKE :building', { building: `%${building}%` })
        .orderBy('place.floor', 'ASC')
        .addOrderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      // Filtre par catégorie
      if (category && typeof category === 'string') {
        queryBuilder.andWhere('category.name ILIKE :category', {
          category: `%${category}%`
        });
      }

      // Filtre par capacité
      if (capacity && !isNaN(Number(capacity))) {
        queryBuilder.andWhere('place.capacity >= :minCapacity', {
          minCapacity: parseInt(capacity as string)
        });
      }

      const [places, total] = await queryBuilder.getManyAndCount();

      if (places.length === 0) {
        return notFound(res, `Aucune salle trouvée dans le bâtiment "${building}".`);
      }

      console.log(`✅ Recherche par bâtiment PostgreSQL: ${building} - ${places.length} résultats`);

      return res.status(200).json({
        success: true,
        message: `Salles du bâtiment ${building} (${places.length} résultats)`,
        data: formatPostgresPlaces(places),
        building: building,
        floors: [...new Set(places.map(p => p.floor).filter(Boolean))],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        source: 'postgresql'
      });

    } else {
      // RECHERCHE PAR BÂTIMENT SQLITE - Non disponible car building n'existe pas dans PlaceLite
      console.warn(`⚠️ Recherche par bâtiment non disponible en mode SQLite - Bâtiment: ${building}`);
      
      return res.status(200).json({
        success: true,
        message: 'Recherche par bâtiment non disponible en mode hors ligne',
        data: [],
        building: building,
        floors: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0
        },
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de la recherche par bâtiment:', err);
    return handleError(res, err, 'Erreur lors de la recherche par bâtiment');
  }
}

// -------------------------------------------------------
//   SALLES AVEC COORDONNÉES GÉOGRAPHIQUES (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function getPlacesWithCoordinates(req: Request, res: Response) {
  try {
    const { page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const postgresAvailable = await isPostgreSQLAvailable();

    if (postgresAvailable) {
      // SALLES AVEC COORDONNÉES POSTGRESQL
      const repo = getRepository(Place);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .leftJoinAndSelect('place.instructor', 'instructor')
        .where('place.latitude IS NOT NULL')
        .andWhere('place.longitude IS NOT NULL')
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      const [places, total] = await queryBuilder.getManyAndCount();

      console.log(`✅ Salles avec coordonnées PostgreSQL: ${places.length} résultats`);

      return res.status(200).json({
        success: true,
        message: `Salles avec coordonnées géographiques (${places.length} résultats)`,
        data: formatPostgresPlaces(places),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        source: 'postgresql'
      });

    } else {
      // SALLES AVEC COORDONNÉES SQLITE
      const repo = sqliteDataSource.getRepository(PlaceLite);
      
      const queryBuilder = repo
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.category', 'category')
        .where('place.latitude IS NOT NULL')
        .andWhere('place.longitude IS NOT NULL')
        .orderBy('place.name', 'ASC')
        .skip(skip)
        .take(limitNum);

      const [places, total] = await queryBuilder.getManyAndCount();

      console.log(`✅ Salles avec coordonnées SQLite: ${places.length} résultats`);

      return res.status(200).json({
        success: true,
        message: `Salles avec coordonnées géographiques (${places.length} résultats) - Mode Hors Ligne`,
        data: formatSqlitePlaces(places),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de la récupération des salles avec coordonnées:', err);
    return handleError(res, err, 'Erreur lors de la récupération des salles géolocalisées');
  }
}

// -------------------------------------------------------
//   STATISTIQUES DES SALLES (ONLINE = PG, OFFLINE = SQLITE)
// -------------------------------------------------------
export async function getPlacesStats(req: Request, res: Response) {
  try {
    const postgresAvailable = await isPostgreSQLAvailable();

    if (postgresAvailable) {
      // STATISTIQUES POSTGRESQL
      const repo = getRepository(Place);

      // Total des salles
      const totalPlaces = await repo.count();

      // Salles avec coordonnées
      const placesWithCoords = await repo
        .createQueryBuilder('place')
        .where('place.latitude IS NOT NULL')
        .andWhere('place.longitude IS NOT NULL')
        .getCount();

      // Salles par bâtiment
      const placesByBuilding = await repo
        .createQueryBuilder('place')
        .select('place.building, COUNT(*) as count')
        .where('place.building IS NOT NULL')
        .groupBy('place.building')
        .getRawMany();

      // Salles par capacité
      const capacityStats = await repo
        .createQueryBuilder('place')
        .select('AVG(place.capacity) as avgCapacity, MAX(place.capacity) as maxCapacity, MIN(place.capacity) as minCapacity')
        .where('place.capacity IS NOT NULL')
        .getRawOne();

      console.log(`✅ Statistiques PostgreSQL récupérées`);

      return res.status(200).json({
        success: true,
        message: 'Statistiques des salles',
        data: {
          overview: {
            total: totalPlaces,
            withCoordinates: placesWithCoords,
            withCoordinatesPercentage: totalPlaces > 0 ? Math.round((placesWithCoords / totalPlaces) * 100) : 0
          },
          byBuilding: placesByBuilding.reduce((acc, stat) => {
            if (stat.place_building) {
              acc[stat.place_building] = parseInt(stat.count);
            }
            return acc;
          }, {} as Record<string, number>),
          capacity: {
            average: capacityStats?.avgcapacity ? Math.round(parseFloat(capacityStats.avgcapacity)) : 0,
            maximum: capacityStats?.maxcapacity ? parseInt(capacityStats.maxcapacity) : 0,
            minimum: capacityStats?.mincapacity ? parseInt(capacityStats.mincapacity) : 0
          }
        },
        source: 'postgresql'
      });

    } else {
      // STATISTIQUES SQLITE
      const repo = sqliteDataSource.getRepository(PlaceLite);

      // Total des salles
      const totalPlaces = await repo.count();

      // Salles avec coordonnées
      const placesWithCoords = await repo
        .createQueryBuilder('place')
        .where('place.latitude IS NOT NULL')
        .andWhere('place.longitude IS NOT NULL')
        .getCount();

      console.log(`✅ Statistiques SQLite récupérées`);

      return res.status(200).json({
        success: true,
        message: 'Statistiques des salles - Mode Hors Ligne',
        data: {
          overview: {
            total: totalPlaces,
            withCoordinates: placesWithCoords,
            withCoordinatesPercentage: totalPlaces > 0 ? Math.round((placesWithCoords / totalPlaces) * 100) : 0
          },
          byBuilding: {}, // Bâtiment non disponible en SQLite
          capacity: {
            average: 0,
            maximum: 0,
            minimum: 0
          }
        },
        source: 'sqlite'
      });
    }

  } catch (err) {
    console.error('❌ Erreur lors de la récupération des statistiques:', err);
    return handleError(res, err, 'Erreur lors de la récupération des statistiques');
  }
}