import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { PartnerVenture, Partner } from '../models/index.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { parsePagination, paginatedResult } from '../utils/pagination.js';
import { toDecimalStringNonNegative, toNumber } from '../utils/decimal.js';

const router = Router();

const assignSchema = z.object({
  partnerId: z.string(),
  ventureId: z.string(),
  loanAmount: z.number().nonnegative().optional(),
  monthlyEmi: z.number().nonnegative().optional(),
  emiStartDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  tenureMonths: z.number().int().positive().optional(),
  isEmiActive: z.boolean().optional(),
});

const patchAssignmentSchema = z.object({
  loanAmount: z.number().nonnegative().optional(),
  monthlyEmi: z.number().nonnegative().optional(),
  emiStartDate: z
    .string()
    .datetime()
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  tenureMonths: z.number().int().positive().nullable().optional(),
  isEmiActive: z.boolean().optional(),
});

/**
 * Serializes PartnerVenture EMI decimal fields for JSON.
 * @param assignment - Lean assignment document
 */
function serializeAssignment(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    loanAmount: assignment.loanAmount != null ? toNumber(assignment.loanAmount) : undefined,
    monthlyEmi: assignment.monthlyEmi != null ? toNumber(assignment.monthlyEmi) : undefined,
    emiStartDate: assignment.emiStartDate
      ? new Date(assignment.emiStartDate as Date).toISOString()
      : undefined,
  };
}

/**
 * Parses optional EMI date from YYYY-MM-DD or ISO string.
 * @param value - Date string
 */
function parseEmiDate(value?: string | null): Date | undefined | null {
  if (value === null) return null;
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

/**
 * GET /api/admin/assignments — paginated assignments with filters.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 10);
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : '';
  const ventureId = typeof req.query.ventureId === 'string' ? req.query.ventureId : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  const filter: Record<string, unknown> = {};
  if (partnerId) filter.partnerId = partnerId;
  if (ventureId) filter.ventureId = ventureId;

  let items = await PartnerVenture.find(filter)
    .populate('partnerId', 'name email')
    .populate('ventureId', 'name')
    .sort({ assignedAt: -1 })
    .lean();

  if (q) {
    items = items.filter((a) => {
      const p = a.partnerId as unknown as { name?: string; email?: string };
      const v = a.ventureId as unknown as { name?: string };
      const hay = `${p?.name ?? ''} ${p?.email ?? ''} ${v?.name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const total = items.length;
  const paged = items
    .slice(skip, skip + limit)
    .map((a) => serializeAssignment(a as Record<string, unknown>));
  res.json(paginatedResult(paged, total, page, limit));
});

/**
 * POST /api/admin/assignments — assign partner to project (optional EMI config).
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = assignSchema.parse(req.body);
    if (!mongoose.Types.ObjectId.isValid(data.partnerId)) {
      res.status(400).json({ error: 'Invalid partner' });
      return;
    }
    const partner = await Partner.findById(data.partnerId).lean();
    if (!partner) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    if (!partner.isActive) {
      res.status(400).json({ error: 'Cannot assign an inactive partner — reactivate them first' });
      return;
    }
    const existing = await PartnerVenture.findOne({
      partnerId: data.partnerId,
      ventureId: data.ventureId,
    });
    if (existing) {
      res.status(409).json({ error: 'Partner already assigned to this project' });
      return;
    }

    const emiStart = parseEmiDate(data.emiStartDate);
    const assignment = await PartnerVenture.create({
      partnerId: data.partnerId,
      ventureId: data.ventureId,
      assignedById: req.user!._id,
      isEmiActive: data.isEmiActive ?? false,
      tenureMonths: data.tenureMonths,
      ...(emiStart ? { emiStartDate: emiStart } : {}),
      ...(data.loanAmount !== undefined
        ? {
            loanAmount: mongoose.Types.Decimal128.fromString(
              toDecimalStringNonNegative(data.loanAmount)
            ),
          }
        : {}),
      ...(data.monthlyEmi !== undefined
        ? {
            monthlyEmi: mongoose.Types.Decimal128.fromString(
              toDecimalStringNonNegative(data.monthlyEmi)
            ),
          }
        : {}),
    });

    const populated = await PartnerVenture.findById(assignment._id)
      .populate('partnerId', 'name email')
      .populate('ventureId', 'name')
      .lean();
    res.status(201).json(serializeAssignment(populated as Record<string, unknown>));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to assign partner' });
  }
});

/**
 * PATCH /api/admin/assignments/:id — update EMI / loan fields on an assignment.
 */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = patchAssignmentSchema.parse(req.body);
    const assignment = await PartnerVenture.findById(req.params.id);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    if (data.loanAmount !== undefined) {
      assignment.loanAmount = mongoose.Types.Decimal128.fromString(
        toDecimalStringNonNegative(data.loanAmount)
      );
    }
    if (data.monthlyEmi !== undefined) {
      assignment.monthlyEmi = mongoose.Types.Decimal128.fromString(
        toDecimalStringNonNegative(data.monthlyEmi)
      );
    }
    if (data.emiStartDate !== undefined) {
      if (data.emiStartDate === null) {
        assignment.emiStartDate = undefined;
      } else {
        const parsed = parseEmiDate(data.emiStartDate);
        if (parsed) assignment.emiStartDate = parsed;
      }
    }
    if (data.tenureMonths !== undefined) {
      assignment.tenureMonths = data.tenureMonths ?? undefined;
    }
    if (data.isEmiActive !== undefined) {
      assignment.isEmiActive = data.isEmiActive;
    }

    await assignment.save();
    const populated = await PartnerVenture.findById(assignment._id)
      .populate('partnerId', 'name email')
      .populate('ventureId', 'name')
      .lean();
    res.json(serializeAssignment(populated as Record<string, unknown>));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

/**
 * DELETE /api/admin/assignments — remove partner from project.
 */
router.delete('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { partnerId, ventureId } = req.body;
  if (!partnerId || !ventureId) {
    res.status(400).json({ error: 'partnerId and ventureId required' });
    return;
  }
  await PartnerVenture.deleteOne({ partnerId, ventureId });
  res.json({ ok: true });
});

export default router;
