import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { 
  createSignalement, 
  listPendingSignalements, 
  processSignalement,
  getSignalementStats,
  getSignalementHistory,
  deleteSignalement,
  getSignalementById
} from '../controllers/signalementController';
import { requireAdminAuth } from '../middleware/jwtAuth';

const router = Router();

// Configuration de multer pour les uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/signalements';
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Générer un nom de fichier unique
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'signalement-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  // Accepter seulement les images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées!'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 6 // max 6 fichiers
  }
});

// 📱 ROUTES PUBLIQUES
router.post('/', upload.array('photos', 6), createSignalement);

// 🔐 ROUTES ADMIN
router.get('/admin/pending', requireAdminAuth, listPendingSignalements);
router.get('/admin/history', requireAdminAuth, getSignalementHistory);
router.get('/admin/stats', requireAdminAuth, getSignalementStats);
router.get('/admin/:id', requireAdminAuth, getSignalementById);
router.post('/admin/:id/process', requireAdminAuth, processSignalement);
router.delete('/admin/:id', requireAdminAuth, deleteSignalement);

export default router;