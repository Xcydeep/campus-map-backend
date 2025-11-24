import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export interface AuthRequest extends Request {
  user?: { sub: string; isAdmin?: boolean };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let auth = req.header('authorization');
  if (!auth) {
    auth = req.header('x-admin-token');
    if (!auth) return res.status(401).json({ message: 'Missing Authorization' });
    // If x-admin-token, treat it as the token directly (no Bearer prefix)
  } else {
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid Authorization header format' });
    auth = parts[1];
  }
  try {
    const payload = jwt.verify(auth, JWT_SECRET) as any;
    req.user = { sub: payload.sub, isAdmin: payload.isAdmin };
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin required' });
    return next();
  });
}
