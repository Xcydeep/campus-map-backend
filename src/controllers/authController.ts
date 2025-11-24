import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pgDataSource } from '../loaders/database';
import { IsNull } from 'typeorm';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Session } from '../models/Session';
import { validateEmail, validatePassword } from '../utils/validation';
import { handleError, notFound, conflict, badRequest } from '../utils/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body;
  if (!email || !password) return badRequest(res, 'Email and password are required');

  if (!validateEmail(email)) return badRequest(res, 'Invalid email format');
  if (!validatePassword(password)) return badRequest(res, 'Password must be at least 6 characters');

  if (process.env.DATABASE_URL) {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection not available. Cannot register user.', 500);
    }
  }

  try {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection is not initialized', 500);
    }
    const repo = pgDataSource.getRepository(User);
    const existing = await repo.findOne({ where: { email } });
    if (existing) return conflict(res, 'Email already exists');

    const hash = await bcrypt.hash(password, 10);
    const user = repo.create({ email, passwordHash: hash, isAdmin: false, name });
    await repo.save(user);
    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT' || err?.message?.includes('unique') || err?.code === '23505') {
      return conflict(res, 'Email already exists');
    }
    handleError(res, err);
  }
}

export async function login(req: Request, res: Response) {
  const { email, password, deviceId } = req.body;
  if (!email || !password) return badRequest(res, 'Email and password are required');
  try {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection is not initialized', 500);
    }
    const repo = pgDataSource.getRepository(User);
    const user = await repo.findOne({ where: { email } });
    if (!user) return badRequest(res, 'Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return badRequest(res, 'Invalid credentials');

    if (!deviceId) {
      const token = jwt.sign({ sub: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token });
    }

    const deviceRepo = pgDataSource.getRepository(Device);
    let device = await deviceRepo.findOne({ where: { deviceId } });
    if (!device) {
      device = deviceRepo.create({ deviceId });
      await deviceRepo.save(device);
    }

    const sessionRepo = pgDataSource.getRepository(Session);
    let activeSession = await sessionRepo.findOne({
      where: { device: { id: device.id }, endedAt: IsNull() }
    });

    if (!activeSession) {
      activeSession = sessionRepo.create({ device, startedAt: new Date() });
      await sessionRepo.save(activeSession);
    } else {
      device.lastSeen = new Date();
      await deviceRepo.save(device);
    }

    const token = jwt.sign({ sub: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    handleError(res, err);
  }
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const { email, password, name } = req.body;

  if (email && !validateEmail(email)) return badRequest(res, 'Invalid email format');
  if (password && !validatePassword(password)) return badRequest(res, 'Password must be at least 6 characters');

  try {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection is not initialized', 500);
    }
    const repo = pgDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id } });
    if (!user) return notFound(res, 'User not found');

    if (email) {
      const existing = await repo.findOne({ where: { email } });
      if (existing && existing.id !== id) return conflict(res, 'Email already exists');
    }

    if (email) user.email = email;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    if (name !== undefined) user.name = name;

    await repo.save(user);
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;

  try {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection is not initialized', 500);
    }
    const repo = pgDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id } });
    if (!user) return notFound(res, 'User not found');

    await repo.remove(user);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function logout(req: Request, res: Response) {
  const { deviceId, userId } = req.body;
  if (!deviceId || !userId) return badRequest(res, 'deviceId and userId required for logout');

  try {
    if (!pgDataSource?.isInitialized) {
      return handleError(res, null, 'Database connection is not initialized', 500);
    }
    const deviceRepo = pgDataSource.getRepository(Device);
    const sessionRepo = pgDataSource.getRepository(Session);

    const device = await deviceRepo.findOne({ where: { deviceId } });
    if (!device) return notFound(res, 'Device not found');

    const session = await sessionRepo.findOne({
      where: {
        device: { id: device.id },
        endedAt: undefined
      }
    });
    if (!session) return notFound(res, 'Active session not found');

    session.endedAt = new Date();
    await sessionRepo.save(session);

    res.json({ message: 'Logout successful' });
  } catch (err) {
    handleError(res, err);
  }
}
