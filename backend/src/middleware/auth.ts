import express from 'express';
const { Request, Response, NextFunction } = express;
import jwt from 'jsonwebtoken';

export interface AuthRequest extends express.Request {
  user?: {
    sub: string;
    username: string;
    role: string;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).send('Access token required');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).send('Server misconfigured');
  }

  try {
    const decoded = jwt.verify(token, secret) as { sub: string; username: string; role: string };
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).send('Invalid or expired token');
  }
}

export function checkRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).send('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).send('Insufficient permissions');
    }

    next();
  };
}
