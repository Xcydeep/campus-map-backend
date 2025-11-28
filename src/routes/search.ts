import { Router } from 'express';
import { 
  searchPlaces, 
  autocompletePlaces,
  searchByCategory,
  searchByBuilding,
  getPlacesWithCoordinates,
  getPlacesStats
} from '../controllers/searchController';

const router = Router();

// 🔍 RECHERCHE AVANCÉE
router.get('/places', searchPlaces);           // GET /search/places?q=A10&category=TD&capacity=30&building=A
router.get('/autocomplete', autocompletePlaces); // GET /search/autocomplete?q=A10&category=Amphi&building=B

// 📁 RECHERCHE PAR CATÉGORIE
router.get('/category/:categoryId', searchByCategory); // GET /search/category/abc-123?building=A&capacity=50

// 🏢 RECHERCHE PAR BÂTIMENT
router.get('/building/:building', searchByBuilding); // GET /search/building/A?category=TD&capacity=25

// 🗺️ SALLES GÉOLOCALISÉES
router.get('/with-coordinates', getPlacesWithCoordinates); // GET /search/with-coordinates?page=1&limit=50

// 📊 STATISTIQUES
router.get('/stats', getPlacesStats); // GET /search/stats

export default router;