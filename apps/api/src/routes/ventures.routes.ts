import { Router, Response } from 'express';
import { Venture, VentureType, PartnerVenture, Category } from '../models/index.js';
import { AuthRequest, requireAuth, requireVentureAccess } from '../middleware/auth.middleware.js';
import { computeVentureSummary } from '../services/settlement.service.js';
import { computeVentureEmiSummary } from '../services/emi.service.js';
import { computeGstSummary } from '../services/invoice.service.js';
import {
  computePartnerVentureAnalytics,
  buildPartnerAnalyticsCsv,
} from '../services/partner-analytics.service.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';
import { ensureGlobalCategories } from '../services/category.service.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/ventures — paginated venture list (scoped for partners).
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 12);
  const regex = searchRegex(req.query.q);
  const status = typeof req.query.status === 'string' ? req.query.status : 'active';
  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : '';

  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  if (typeId) filter.ventureTypeId = typeId;
  if (regex) {
    filter.$or = [{ name: regex }, { description: regex }];
  }

  if (user.role !== 'admin') {
    const assignments = await PartnerVenture.find({ partnerId: user._id }).lean();
    const ventureIds = assignments.map((a) => a.ventureId);
    filter._id = { $in: ventureIds };
    if (status === 'all' || !filter.status) {
      filter.status = 'active';
    }
  }

  const [items, total] = await Promise.all([
    Venture.find(filter).populate('ventureTypeId').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Venture.countDocuments(filter),
  ]);

  res.json(paginatedResult(items, total, page, limit));
});

/**
 * GET /api/ventures/types — public venture types for UI cards.
 */
router.get('/types', async (_req, res: Response): Promise<void> => {
  const types = await VentureType.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  res.json(types);
});

/**
 * GET /api/ventures/:id/summary — KPIs and settlement.
 */
router.get('/:id/summary', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const summary = await computeVentureSummary(String(req.params.id));
  res.json(summary);
});

/**
 * GET /api/ventures/:id/partners/:partnerId/analytics — partner-level project analytics.
 */
router.get(
  '/:id/partners/:partnerId/analytics',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const data = await computePartnerVentureAnalytics(
      String(req.params.id),
      String(req.params.partnerId)
    );
    if (!data) {
      res.status(404).json({ error: 'Partner analytics not found for this project' });
      return;
    }
    res.json(data);
  }
);

/**
 * GET /api/ventures/:id/partners/:partnerId/report.csv — downloadable partner report.
 */
router.get(
  '/:id/partners/:partnerId/report.csv',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const data = await computePartnerVentureAnalytics(
      String(req.params.id),
      String(req.params.partnerId)
    );
    if (!data) {
      res.status(404).json({ error: 'Partner analytics not found for this project' });
      return;
    }

    const csv = buildPartnerAnalyticsCsv(data);
    const safePartner = data.partner.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeVenture = data.venture.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safePartner}-${safeVenture}-report.csv"`
    );
    res.send(csv);
  }
);

/**
 * GET /api/ventures/:id/gst-summary — invoice-centric GST aggregation.
 */
router.get(
  '/:id/gst-summary',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const summary = await computeGstSummary(String(req.params.id), from, to);
    res.json(summary);
  }
);

/**
 * GET /api/ventures/:id/emi — EMI / loan board for the project.
 */
router.get('/:id/emi', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const summary = await computeVentureEmiSummary(String(req.params.id));
  res.json(summary);
});

/**
 * GET /api/ventures/:id/categories — global + venture categories for entry forms.
 */
router.get(
  '/:id/categories',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    await ensureGlobalCategories();
    const ventureId = String(req.params.id);
    const direction = typeof req.query.direction === 'string' ? req.query.direction : undefined;
    const filter: Record<string, unknown> = {
      isActive: true,
      $or: [{ ventureId: null }, { ventureId }],
    };
    if (direction === 'IN' || direction === 'OUT') {
      filter.direction = direction;
    }
    const categories = await Category.find(filter).sort({ direction: 1, name: 1 }).lean();
    res.json(categories);
  }
);

/**
 * GET /api/ventures/:id — single venture detail.
 */
router.get('/:id', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const venture = await Venture.findById(req.params.id).populate('ventureTypeId').lean();
  if (!venture) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const assignments = await PartnerVenture.find({ ventureId: venture._id })
    .populate('partnerId', 'name email')
    .lean();

  res.json({ ...venture, partners: assignments.map((a) => a.partnerId) });
});

export default router;
