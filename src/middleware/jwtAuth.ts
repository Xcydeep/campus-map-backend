import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export interface AuthRequest extends Request {
  user?: { 
    id: string;        
    isAdmin?: boolean;
    email?: string;
  };
}


export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  console.log('🔐 requireAuth called');
  
  let token: string | undefined;
  
  const authHeader = req.header('authorization');
  console.log('Authorization header:', authHeader);
  
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
      console.log('Token from Authorization:', token?.substring(0, 20) + '...');
    } else {
      console.log('❌ Invalid Authorization format');
      return res.status(401).json({ message: 'Invalid Authorization header format' });
    }
  }
  
  if (!token) {
    token = req.header('x-admin-token');
    console.log('x-admin-token:', token?.substring(0, 20) + '...');
  }
  
  if (!token) {
    console.log('❌ No token found');
    return res.status(401).json({ message: 'Missing Authorization token' });
  }
  
  try {
    console.log('🔍 Verifying token...');
    const payload = jwt.verify(token, JWT_SECRET) as any;
    console.log('✅ Token payload:', payload);
    
   
   const userId = payload.id || payload.sub;

    
    if (!userId) {
      console.log('❌ No user ID in token payload');
      return res.status(401).json({ message: 'Unauthorized - no user ID in token' });
    }
    
    req.user = { 
      id: userId, 
      isAdmin: payload.isAdmin,
      email: payload.email
    };
    
    console.log('✅ User set in request:', req.user);
    
    return next();
  } catch (e: any) {
    console.log('❌ Token verification failed:', e.message);
    return res.status(401).json({ message: 'Invalid token: ' + e.message });
  }
}

export function requireAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  console.log('👑 requireAdminAuth called');
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      console.log('❌ User is not admin:', req.user);
      return res.status(403).json({ message: 'Admin access required' });
    }
    console.log('✅ User is admin, proceeding...');
    return next();
  });
}