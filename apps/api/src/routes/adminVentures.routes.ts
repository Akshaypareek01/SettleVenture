import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Venture, Transaction } from '../models/index.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cascadeDeleteVenture } from '../services/cascade.service.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';
import { bankAccountInputSchema, mapBankAccounts } from '../utils/bankAccounts.js';

const router = Router();

const createVentureSchema = z.object({
  name: z.string().min(2),
  ventureTypeId: z.string(),
  description: z.string().optional(),
  bankAccounts: z
    .array(bankAccountInputSchema)
    .min(1, 'At least one bank account is required'),
});

/**
 * GET /api/admin/ventures — paginated projects with search & filters.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const regex = searchRegex(req.query.q);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : '';

  const filter: Record<string, unknown> = {};
  if (status === 'active') filter.status = 'active';
  if (status === 'closed') filter.status = 'closed';
  if (typeId) filter.ventureTypeId = typeId;
  if (regex) {
    filter.$or = [{ name: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    Venture.find(filter).populate('ventureTypeId').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Venture.countDocuments(filter),
  ]);

  res.json(paginatedResult(items, total, page, limit));
});

/**
 * POST /api/admin/ventures — create a project.
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createVentureSchema.parse(req.body);
    if (!mongoose.Types.ObjectId.isValid(data.ventureTypeId)) {
      res.status(400).json({ error: 'Invalid venture type' });
      return;
    }
    const venture = await Venture.create({
      name: data.name,
      ventureTypeId: data.ventureTypeId,
      description: data.description,
      bankAccounts: mapBankAccounts(data.bankAccounts),
    });
    const populated = await Venture.findById(venture._id).populate('ventureTypeId').lean();
    res.status(201).json(populated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create venture' });
  }
});

/**
 * PATCH /api/admin/ventures/:id — update project details, status, or bank accounts.
 */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      status: z.enum(['active', 'closed']).optional(),
      bankAccounts: z.array(bankAccountInputSchema).optional(),
    });
    const data = updateSchema.parse(req.body);
    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status) updates.status = data.status;
    if (data.bankAccounts !== undefined) {
      if (data.bankAccounts.length === 0) {
        res.status(400).json({ error: 'Keep at least one bank account on the project' });
        return;
      }

      const existing = await Venture.findById(req.params.id).lean();
      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const keepIds = new Set(
        data.bankAccounts
          .map((a) => a._id)
          .filter((id): id is string => Boolean(id && mongoose.Types.ObjectId.isValid(id)))
      );
      const removed = (existing.bankAccounts ?? []).filter((a) => !keepIds.has(String(a._id)));
      if (removed.length) {
        const removedIds = removed.map((a) => a._id);
        const linked = await Transaction.countDocuments({
          ventureId: existing._id,
          bankAccountId: { $in: removedIds },
          isDeleted: false,
        });
        if (linked > 0) {
          const labels = removed.map((a) => a.label).join(', ');
          res.status(400).json({
            error: `Cannot remove bank account(s) with history (${labels}). Deactivate them instead.`,
          });
          return;
        }
      }

      updates.bankAccounts = mapBankAccounts(data.bankAccounts);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const venture = await Venture.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('ventureTypeId')
      .lean();
    if (!venture) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(venture);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/admin/ventures/:id — delete project. ?force=true removes all investments & files.
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const force = req.query.force === 'true';
    const venture = await Venture.findById(req.params.id);
    if (!venture) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const txnCount = await Transaction.countDocuments({ ventureId: venture._id });
    if (txnCount > 0 && !force) {
      res.status(400).json({
        error: `Cannot delete — project has ${txnCount} investment record(s). Use force delete to remove all.`,
        recordCount: txnCount,
        requiresForce: true,
      });
      return;
    }

    await cascadeDeleteVenture(venture._id);
    await venture.deleteOne();
    res.json({ ok: true, deletedRecords: force ? txnCount : 0 });
  } catch {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
