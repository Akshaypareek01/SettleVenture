import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  Partner,
  Venture,
  VentureType,
  PartnerVenture,
  Transaction,
} from '../models/index.js';
import { AuthRequest, requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { computeVentureSummary } from '../services/settlement.service.js';
import {
  cascadeDeletePartner,
  cascadeDeleteVentureType,
} from '../services/cascade.service.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';
import adminVenturesRoutes from './adminVentures.routes.js';
import adminAssignmentsRoutes from './adminAssignments.routes.js';
import adminCompanyRoutes from './adminCompany.routes.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.use('/ventures', adminVenturesRoutes);
router.use('/assignments', adminAssignmentsRoutes);
router.use('/company-profile', adminCompanyRoutes);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const createPartnerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(['partner', 'admin']).default('partner'),
});

/**
 * GET /api/admin/dashboard — cross-venture overview.
 */
router.get('/dashboard', async (_req, res: Response): Promise<void> => {
  const ventures = await Venture.find({ status: 'active' }).lean();
  const partnerCount = await Partner.countDocuments({ role: 'partner', isActive: true });
  const txnCount = await Transaction.countDocuments({ isDeleted: false });

  const summaries = await Promise.all(
    ventures.map(async (v) => ({
      ventureId: v._id,
      name: v.name,
      ...(await computeVentureSummary(String(v._id))),
    }))
  );

  res.json({ partnerCount, ventureCount: ventures.length, txnCount, ventures: summaries });
});

/**
 * GET /api/admin/partners — paginated partner list with search & status filter.
 */
router.get('/partners', async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const regex = searchRegex(req.query.q);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';

  const filter: Record<string, unknown> = { role: 'partner' };
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (regex) {
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const [items, total] = await Promise.all([
    Partner.find(filter).select('-passwordHash').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Partner.countDocuments(filter),
  ]);

  res.json(paginatedResult(items, total, page, limit));
});

/**
 * POST /api/admin/partners — create a new user.
 */
router.post('/partners', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createPartnerSchema.parse(req.body);
    const existing = await Partner.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    const partner = await Partner.create({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
    });
    res.status(201).json({
      id: partner._id,
      name: partner.name,
      email: partner.email,
      role: partner.role,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create partner' });
  }
});

/**
 * PATCH /api/admin/partners/:id — update partner name, status, or password.
 */
router.patch('/partners/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      isActive: z.boolean().optional(),
      password: passwordSchema.optional(),
    });
    const data = updateSchema.parse(req.body);

    if (String(req.params.id) === String(req.user!._id) && data.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    const target = await Partner.findById(req.params.id).select('role').lean();
    if (!target) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    if (target.role === 'admin' && String(req.params.id) !== String(req.user!._id)) {
      res.status(403).json({ error: 'Admin accounts can only be modified by their owner' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (typeof data.isActive === 'boolean') updates.isActive = data.isActive;
    if (data.password) updates.passwordHash = await bcrypt.hash(data.password, 12);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const partner = await Partner.findByIdAndUpdate(req.params.id, updates, { new: true })
      .select('-passwordHash')
      .lean();
    if (!partner) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    res.json(partner);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to update partner' });
  }
});

/**
 * DELETE /api/admin/partners/:id — delete partner. ?force=true removes all their records.
 */
router.delete('/partners/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const force = req.query.force === 'true';
    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    if (partner.role === 'admin') {
      res.status(400).json({ error: 'Cannot delete admin accounts' });
      return;
    }
    if (String(partner._id) === String(req.user!._id)) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }

    const txnCount = await Transaction.countDocuments({ partnerId: partner._id });
    if (txnCount > 0 && !force) {
      res.status(400).json({
        error: `Cannot delete — ${partner.name} has ${txnCount} investment record(s). Use force delete to remove all records.`,
        recordCount: txnCount,
        requiresForce: true,
      });
      return;
    }

    if (force && txnCount > 0) {
      await cascadeDeletePartner(partner._id);
    } else {
      await PartnerVenture.deleteMany({ partnerId: partner._id });
    }
    await partner.deleteOne();
    res.json({ ok: true, deletedRecords: force ? txnCount : 0 });
  } catch {
    res.status(500).json({ error: 'Failed to delete partner' });
  }
});

/**
 * GET /api/admin/venture-types — paginated types with search & status filter.
 */
router.get('/venture-types', async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const regex = searchRegex(req.query.q);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';

  const filter: Record<string, unknown> = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (regex) {
    filter.$or = [{ label: regex }, { slug: regex }];
  }

  const [items, total] = await Promise.all([
    VentureType.find(filter).sort({ sortOrder: 1, label: 1 }).skip(skip).limit(limit).lean(),
    VentureType.countDocuments(filter),
  ]);

  res.json(paginatedResult(items, total, page, limit));
});

const createVentureTypeSchema = z.object({
  label: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only'),
  icon: z.string().default('folder'),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Valid hex color required'),
});

/**
 * POST /api/admin/venture-types — create a new project type.
 */
router.post('/venture-types', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createVentureTypeSchema.parse(req.body);
    const existing = await VentureType.findOne({ slug: data.slug });
    if (existing) {
      res.status(409).json({ error: 'This type slug already exists' });
      return;
    }
    const maxOrder = await VentureType.findOne().sort({ sortOrder: -1 }).lean();
    const type = await VentureType.create({
      ...data,
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
    });
    res.status(201).json(type);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create venture type' });
  }
});

/**
 * PATCH /api/admin/venture-types/:id — update project type.
 */
router.patch('/venture-types/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updateSchema = z.object({
      label: z.string().min(2).optional(),
      icon: z.string().optional(),
      colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      isActive: z.boolean().optional(),
    });
    const data = updateSchema.parse(req.body);
    const type = await VentureType.findByIdAndUpdate(req.params.id, data, { new: true }).lean();
    if (!type) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    res.json(type);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to update venture type' });
  }
});

/**
 * DELETE /api/admin/venture-types/:id — delete type. ?force=true deletes all projects of this type.
 */
router.delete('/venture-types/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const force = req.query.force === 'true';
    const type = await VentureType.findById(req.params.id);
    if (!type) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    const ventureCount = await Venture.countDocuments({ ventureTypeId: type._id });
    if (ventureCount > 0 && !force) {
      res.status(400).json({
        error: `Cannot delete — ${ventureCount} project(s) use this type. Use force delete to remove all.`,
        recordCount: ventureCount,
        requiresForce: true,
      });
      return;
    }

    if (force && ventureCount > 0) {
      await cascadeDeleteVentureType(type._id);
      await type.deleteOne();
      res.json({ ok: true, deletedProjects: ventureCount });
      return;
    }

    await type.deleteOne();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete venture type' });
  }
});

export default router;
