import { Request, Response, NextFunction } from 'express';

// Very small placeholder admin middleware: checks for header x-admin-token == ADMIN_TOKEN
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-admin-token');
  if (token && token === process.env.ADMIN_TOKEN) return next();
  return res.status(401).json({ message: 'Unauthorized' });
}
