import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { IsNull, Like, FindOptionsWhere } from 'typeorm';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Session } from '../models/Session';
import { getPgRepo } from '../loaders/database';
import { 
  handleError, 
  notFound, 
  conflict, 
  badRequest, 
} from '../utils/errorHandler';
import {  
  validateEmail, 
  validatePassword,
  validateId 
} from '../utils/validation';
import { AuthRequest } from '../middleware/jwtAuth'; // IMPORT AJOUTÉ

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

// Validation messages constants
const VALIDATION_MESSAGES = {
  EMAIL_REQUIRED: 'Email is required',
  EMAIL_INVALID: 'Invalid email format',
  PASSWORD_REQUIRED: 'Password is required',
  PASSWORD_INVALID: 'Password must be at least 6 characters',
  NAME_TOO_SHORT: 'Name must be at least 2 characters',
  NAME_TOO_LONG: 'Name cannot exceed 50 characters',
  DEVICE_ID_REQUIRED: 'Device ID is required',
  USER_ID_REQUIRED: 'User ID is required',
  CREDENTIALS_INVALID: 'Invalid email or password',
  USER_NOT_FOUND: 'User not found',
  DEVICE_NOT_FOUND: 'Device not found',
  SESSION_NOT_FOUND: 'Active session not found'
};

export async function getUsers(req: Request, res: Response) {
  try {
    const { page = 1, limit = 10, search, email } = req.query;
    const pageNumber = Math.max(1, parseInt(page as string, 10));
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNumber - 1) * limitNumber;

    const repo = getPgRepo(User);
    const whereConditions: FindOptionsWhere<User> = {};

    if (email && typeof email === 'string') {
      whereConditions.email = Like(`%${email}%`);
    }

    if (search && typeof search === 'string') {
      whereConditions.name = Like(`%${search}%`);
    }

    const [users, total] = await repo.findAndCount({
      where: whereConditions,
      skip,
      take: limitNumber,
      select: ['id', 'email', 'name', 'isAdmin'],
      order: { email: 'ASC' }
    });

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      users,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalUsers: total,
        hasNext: pageNumber < totalPages,
        hasPrev: pageNumber > 1
      }
    });
  } catch (err) {
    handleError(res, err, 'Error fetching users');
  }
}

export async function getUserById(req: Request, res: Response) {
  const { id } = req.params;

  if (!validateId(id)) {
    return badRequest(res, 'Invalid user ID');
  }

  try {
    const repo = getPgRepo(User);
    const user = await repo.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'isAdmin']
    });

    if (!user) {
      return notFound(res, VALIDATION_MESSAGES.USER_NOT_FOUND);
    }

    res.json({ user });
  } catch (err) {
    handleError(res, err, 'Error fetching user');
  }
}

/*export async function getCurrentUser(req: Request, res: Response) {
  try {
    // CORRIGÉ: Utiliser AuthRequest pour avoir accès à req.user
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    console.log('👤 getCurrentUser - User ID from token:', userId);

    if (!userId) {
      console.log('❌ getCurrentUser - No user ID found');
      return res.status(401).json({ message: 'Unauthorized - no user ID in token' });
    }

    const repo = getPgRepo(User);
    const user = await repo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'isAdmin']
    });

    if (!user) {
      console.log('❌ getCurrentUser - User not found in database:', userId);
      return notFound(res, VALIDATION_MESSAGES.USER_NOT_FOUND);
    }

    console.log('✅ getCurrentUser - User found:', { id: user.id, email: user.email });
    res.json({ user });
  } catch (err) {
    console.error('💥 getCurrentUser - Error:', err);
    handleError(res, err, 'Error fetching user profile');
  }
}*/





export async function getCurrentUser(req: Request, res: Response) {
  try {
    const authReq = req as AuthRequest;
    
    // DEBUG: Voir tout ce qui est dans la requête
    console.log('🔍 DEBUG - Headers:', req.headers);
    console.log('🔍 DEBUG - Auth user object:', authReq.user);
    console.log('🔍 DEBUG - Full req.user:', (req as any).user);
    
    const userId = authReq.user?.id;
    console.log('👤 getCurrentUser - User ID from token:', userId);

    if (!userId) {
      console.log('❌ getCurrentUser - No user ID found in authReq.user');
      // Vérifier si c'est dans un autre endroit
      const altUserId = (req as any).user?.id || (req as any).user?.sub;
      console.log('🔍 Alternative user ID check:', altUserId);
      
      return res.status(401).json({ 
        message: 'Unauthorized - no user ID in token',
        debug: {
          authReqUser: authReq.user,
          reqUser: (req as any).user,
          headers: Object.keys(req.headers)
        }
      });
    }
     const repo = getPgRepo(User);
    const user = await repo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'isAdmin']
    });

    if (!user) {
      console.log('❌ getCurrentUser - User not found in database:', userId);
      return notFound(res, VALIDATION_MESSAGES.USER_NOT_FOUND);
    }

    console.log('✅ getCurrentUser - User found:', { id: user.id, email: user.email });
    res.json({ user });

    // ... reste du code
  } catch (err) {
    console.error('💥 getCurrentUser - Error:', err);
    handleError(res, err, 'Error fetching user profile');
  }
}

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body;

  if (!email) return badRequest(res, VALIDATION_MESSAGES.EMAIL_REQUIRED);
  if (!password) return badRequest(res, VALIDATION_MESSAGES.PASSWORD_REQUIRED);

  if (!validateEmail(email)) return badRequest(res, VALIDATION_MESSAGES.EMAIL_INVALID);
  if (!validatePassword(password)) return badRequest(res, VALIDATION_MESSAGES.PASSWORD_INVALID);

  if (name) {
    if (name.length < 2) return badRequest(res, VALIDATION_MESSAGES.NAME_TOO_SHORT);
    if (name.length > 50) return badRequest(res, VALIDATION_MESSAGES.NAME_TOO_LONG);
  }

  try {
    const repo = getPgRepo(User);
    const existing = await repo.findOne({ where: { email } });
    if (existing) return conflict(res, 'Email already exists');

    const hash = await bcrypt.hash(password, 12);
    const user = repo.create({ 
      email: email.toLowerCase().trim(), 
      passwordHash: hash, 
      isAdmin: false, 
      name: name ? name.trim() : null 
    });
    
    await repo.save(user);
    
    res.status(201).json({ 
      message: 'User created successfully',
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      } 
    });
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT' || err?.message?.includes('unique') || err?.code === '23505') {
      return conflict(res, 'Email already exists');
    }
    handleError(res, err, 'Error creating user');
  }
}

export async function login(req: Request, res: Response) {
  const { email, password, deviceId } = req.body;

  console.log('🔑 Login attempt for:', email);

  if (!email) return badRequest(res, VALIDATION_MESSAGES.EMAIL_REQUIRED);
  if (!password) return badRequest(res, VALIDATION_MESSAGES.PASSWORD_REQUIRED);

  if (!validateEmail(email)) return badRequest(res, VALIDATION_MESSAGES.EMAIL_INVALID);

  try {
    const repo = getPgRepo(User);
    const user = await repo.findOne({ where: { email: email.toLowerCase().trim() } });
    
    if (!user) {
      console.log('❌ Login - User not found:', email);
      return badRequest(res, VALIDATION_MESSAGES.CREDENTIALS_INVALID);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      console.log('❌ Login - Invalid password for:', email);
      return badRequest(res, VALIDATION_MESSAGES.CREDENTIALS_INVALID);
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin
    };

    console.log('✅ Login successful for:', email, 'isAdmin:', user.isAdmin);

    if (!deviceId) {
      // CORRIGÉ: Inclure 'id' explicitement dans le token
      const token = jwt.sign({ 
        id: user.id,        // AJOUTÉ
        sub: user.id, 
        isAdmin: user.isAdmin,
        email: user.email 
      }, JWT_SECRET, { 
        expiresIn: '7d'
      });
      
      console.log('✅ Token generated, length:', token.length);
      
      return res.json({ 
        message: 'Login successful',
        token,
        user: userResponse
      });
    }

    if (deviceId.length < 1 || deviceId.length > 255) {
      return badRequest(res, 'Device ID must be between 1 and 255 characters');
    }

    const deviceRepo = getPgRepo(Device);
    let device = await deviceRepo.findOne({ where: { deviceId } });
    
    if (!device) {
      device = deviceRepo.create({ deviceId });
      await deviceRepo.save(device);
    }

    const sessionRepo = getPgRepo(Session);
    let activeSession = await sessionRepo.findOne({
      where: { device: { id: device.id }, endedAt: IsNull() }
    });

    if (!activeSession) {
      activeSession = sessionRepo.create({ 
        device, 
        user,
        startedAt: new Date() 
      });
      await sessionRepo.save(activeSession);
    } else {
      device.lastSeen = new Date();
      await deviceRepo.save(device);
    }

    const token = jwt.sign({ 
      id: user.id,        // AJOUTÉ
      sub: user.id, 
      isAdmin: user.isAdmin,
      email: user.email,
      deviceId: device.id
    }, JWT_SECRET, { 
      expiresIn: '7d'
    });

    res.json({
      message: 'Login successful with device',
      token,
      user: userResponse,
      device: {
        id: device.id,
        deviceId: device.deviceId
      }
    });
  } catch (err) {
    console.error('💥 Login error:', err);
    handleError(res, err, 'Error during login');
  }
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const { email, password, name } = req.body;

  if (!validateId(id)) {
    return badRequest(res, 'Invalid user ID');
  }

  if (email && !validateEmail(email)) return badRequest(res, VALIDATION_MESSAGES.EMAIL_INVALID);
  if (password && !validatePassword(password)) return badRequest(res, VALIDATION_MESSAGES.PASSWORD_INVALID);
  if (name !== undefined && name !== null) {
    if (name.length < 2) return badRequest(res, VALIDATION_MESSAGES.NAME_TOO_SHORT);
    if (name.length > 50) return badRequest(res, VALIDATION_MESSAGES.NAME_TOO_LONG);
  }

  try {
    const repo = getPgRepo(User);
    const user = await repo.findOne({ where: { id } });
    if (!user) return notFound(res, VALIDATION_MESSAGES.USER_NOT_FOUND);

    if (email) {
      const existing = await repo.findOne({ where: { email: email.toLowerCase().trim() } });
      if (existing && existing.id !== id) return conflict(res, 'Email already exists');
    }

    if (email) user.email = email.toLowerCase().trim();
    if (password) user.passwordHash = await bcrypt.hash(password, 12);
    if (name !== undefined) user.name = name ? name.trim() : null;

    await repo.save(user);
    
    res.json({ 
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin
      }
    });
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT' || err?.message?.includes('unique') || err?.code === '23505') {
      return conflict(res, 'Email already exists');
    }
    handleError(res, err, 'Error updating user');
  }
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;

  if (!validateId(id)) {
    return badRequest(res, 'Invalid user ID');
  }

  try {
    const repo = getPgRepo(User);
    const user = await repo.findOne({ where: { id } });
    if (!user) return notFound(res, VALIDATION_MESSAGES.USER_NOT_FOUND);

    const currentUserId = (req as any).user?.id;
    if (currentUserId && currentUserId === id) {
      return badRequest(res, 'You cannot delete your own account');
    }

    await repo.remove(user);
    
    res.json({ 
      message: 'User deleted successfully'
    });
  } catch (err) {
    handleError(res, err, 'Error deleting user');
  }
}

export async function logout(req: Request, res: Response) {
  const { deviceId, userId } = req.body;

  if (!deviceId) return badRequest(res, VALIDATION_MESSAGES.DEVICE_ID_REQUIRED);
  if (!userId) return badRequest(res, VALIDATION_MESSAGES.USER_ID_REQUIRED);

  try {
    const deviceRepo = getPgRepo(Device);
    const sessionRepo = getPgRepo(Session);

    const device = await deviceRepo.findOne({ where: { deviceId } });
    if (!device) return notFound(res, VALIDATION_MESSAGES.DEVICE_NOT_FOUND);

    const session = await sessionRepo.findOne({
      where: {
        device: { id: device.id },
        endedAt: IsNull()
      }
    });
    
    if (!session) return notFound(res, VALIDATION_MESSAGES.SESSION_NOT_FOUND);

    session.endedAt = new Date();
    await sessionRepo.save(session);

    res.json({ 
      message: 'Logout successful'
    });
  } catch (err) {
    handleError(res, err, 'Error during logout');
  }
}


