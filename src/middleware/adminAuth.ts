import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ADMIN_SESSION_SECRET } from '../config';

const adminSessions = new Map<string, string>();

export interface AdminIdentity {
  userId: string;
  role: 'admin' | 'super_admin';
}

export function getAdminIdentity(req: Request): AdminIdentity | null {
  const token = req.headers['x-admin-token'];
  if (typeof token !== 'string') return null;
  const sessionUserId = adminSessions.get(token);
  if (sessionUserId) return { userId: sessionUserId, role: 'admin' };

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const expectedSignature = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('base64url');
    const validSignature = signature.length === expectedSignature.length
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    if (!validSignature) return null;

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      role?: string;
      expiresAt?: number;
    };
    if ((session.role === 'admin' || session.role === 'super_admin')
      && typeof session.userId === 'string'
      && typeof session.expiresAt === 'number'
      && session.expiresAt > Date.now()) {
      return { userId: session.userId, role: session.role };
    }
    return null;
  } catch {
    return null;
  }
}

export function isAdminRequest(req: Request): boolean {
  return getAdminIdentity(req) !== null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: 'Admin authorization required.' });
    return;
  }
  next();
}
