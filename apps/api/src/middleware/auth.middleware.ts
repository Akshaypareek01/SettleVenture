import { Request, Response, NextFunction } from 'express';
import { Partner, IPartner } from '../models/Partner.model.js';
import { PartnerVenture } from '../models/PartnerVenture.model.js';
import { verifyToken } from '../utils/jwt.js';

export interface AuthRequest extends Request {
  user?: IPartner;
}

const COOKIE_NAME = 'apexledger_token';

/**
 * Reads JWT from httpOnly cookie.
 * @param req - Express request
 */
export function getTokenFromRequest(req: Request): string | null {
  return req.cookies?.[COOKIE_NAME] ?? null;
}

export { COOKIE_NAME };

/**
 * Requires a valid authenticated session.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const payload = verifyToken(token);
    const user = await Partner.findById(payload.sub);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid or inactive account' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}

/**
 * Requires admin role.
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Ensures partner is assigned to the venture (admins bypass).
 */
export async function requireVentureAccess(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ventureId = req.params.ventureId || req.params.id || req.body?.ventureId;
    if (!ventureId) {
      res.status(400).json({ error: 'Venture ID required' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (req.user.role === 'admin') {
      next();
      return;
    }
    const assignment = await PartnerVenture.findOne({
      partnerId: req.user._id,
      ventureId,
    });
    if (!assignment) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
