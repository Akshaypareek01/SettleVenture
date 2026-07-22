import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Partner } from '../models/Partner.model.js';
import { AuthRequest, requireAuth, COOKIE_NAME } from '../middleware/auth.middleware.js';
import { signToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { computePartnerTotalInvested } from '../services/settlement.service.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * POST /api/auth/login — authenticate and set httpOnly cookie.
 */
router.post('/login', loginLimiter, async (req, res): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await Partner.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const token = signToken({ sub: String(user._id), email: user.email, role: user.role });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout — clear session cookie.
 */
router.post('/logout', (_req, res): void => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

/**
 * GET /api/auth/me — current user profile.
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const totalInvested = user.role === 'partner'
    ? await computePartnerTotalInvested(String(user._id))
    : 0;
  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    totalInvested,
  });
});

export default router;
