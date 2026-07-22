import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Invoice, Venture } from '../models/index.js';
import { AuthRequest, requireAuth, requireVentureAccess } from '../middleware/auth.middleware.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';
import {
  allocateInvoiceNumber,
  assertCompanyReadyToIssue,
  computeInvoiceMoney,
  getOrCreateCompanyProfile,
  markInvoicePaid,
  serializeInvoice,
} from '../services/invoice.service.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const lineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
});

const upsertInvoiceSchema = z.object({
  customerName: z.string().min(1),
  customerGstin: z.string().optional(),
  customerAddress: z.string().optional(),
  dueDate: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  gstRate: z.number().min(0).max(100).default(18),
  isInterState: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const markPaidSchema = z.object({
  bankAccountId: z.string().min(1),
  paidFrom: z.string().min(1, 'Source note is required'),
  remark: z.string().min(1, 'Remark is required'),
  date: z.string().datetime().optional(),
  attachmentIds: z.array(z.string()).min(1, 'Proof attachment is required'),
});

/**
 * Maps money fields from computeInvoiceMoney onto Decimal128 create/update payload.
 * @param money - Computed invoice money breakdown
 */
function moneyToDecimals(money: ReturnType<typeof computeInvoiceMoney>) {
  return {
    lineItems: money.lineItems.map((li) => ({
      description: li.description,
      qty: li.qty,
      rate: mongoose.Types.Decimal128.fromString(li.rate.toFixed(2)),
      amount: mongoose.Types.Decimal128.fromString(li.amount.toFixed(2)),
    })),
    taxableAmount: mongoose.Types.Decimal128.fromString(money.taxableAmount.toFixed(2)),
    gstAmount: mongoose.Types.Decimal128.fromString(money.gstAmount.toFixed(2)),
    cgst: mongoose.Types.Decimal128.fromString(money.cgst.toFixed(2)),
    sgst: mongoose.Types.Decimal128.fromString(money.sgst.toFixed(2)),
    igst: mongoose.Types.Decimal128.fromString(money.igst.toFixed(2)),
    totalAmount: mongoose.Types.Decimal128.fromString(money.totalAmount.toFixed(2)),
  };
}

/**
 * GET /api/ventures/:ventureId/invoices — paginated invoice list.
 */
router.get('/', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const ventureId = String(req.params.ventureId);
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const regex = searchRegex(req.query.q);

  const filter: Record<string, unknown> = { ventureId };
  if (status !== 'all') filter.status = status;
  if (regex) {
    filter.$or = [{ customerName: regex }, { number: regex }, { notes: regex }];
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);

  res.json(
    paginatedResult(
      items.map((i) => serializeInvoice(i as Record<string, unknown>)),
      total,
      page,
      limit
    )
  );
});

/**
 * POST /api/ventures/:ventureId/invoices — create draft invoice.
 */
router.post('/', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ventureId = String(req.params.ventureId);
    const venture = await Venture.findById(ventureId);
    if (!venture || venture.status === 'closed') {
      res.status(400).json({ error: 'Project is closed or not found' });
      return;
    }

    await getOrCreateCompanyProfile();
    const data = upsertInvoiceSchema.parse(req.body);
    const money = computeInvoiceMoney(data.lineItems, data.gstRate, data.isInterState);

    const invoice = await Invoice.create({
      ventureId,
      status: 'draft',
      customerName: data.customerName.trim(),
      customerGstin: data.customerGstin?.trim(),
      customerAddress: data.customerAddress?.trim(),
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      gstRate: data.gstRate,
      isInterState: data.isInterState,
      notes: data.notes?.trim(),
      createdById: req.user!._id,
      ...moneyToDecimals(money),
    });

    res.status(201).json(serializeInvoice(invoice.toObject() as unknown as Record<string, unknown>));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/**
 * GET /api/ventures/:ventureId/invoices/:invoiceId
 */
router.get(
  '/:invoiceId',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      ventureId: req.params.ventureId,
    })
      .populate('createdById', 'name email')
      .lean();
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.json(serializeInvoice(invoice as Record<string, unknown>));
  }
);

/**
 * PATCH /api/ventures/:ventureId/invoices/:invoiceId — update draft, issue, or cancel.
 */
router.patch(
  '/:invoiceId',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ventureId = String(req.params.ventureId);
      const invoice = await Invoice.findOne({ _id: req.params.invoiceId, ventureId });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const action = typeof req.body.action === 'string' ? req.body.action : '';

      if (action === 'issue') {
        if (invoice.status !== 'draft') {
          res.status(400).json({ error: 'Only drafts can be issued' });
          return;
        }
        const ready = await assertCompanyReadyToIssue();
        if (!ready.ok) {
          res.status(400).json({ error: ready.error });
          return;
        }
        const { number, snapshot } = await allocateInvoiceNumber();
        invoice.number = number;
        invoice.companySnapshot = snapshot;
        invoice.status = 'issued';
        invoice.issueDate = new Date();
        await invoice.save();
        res.json(serializeInvoice(invoice.toObject() as unknown as Record<string, unknown>));
        return;
      }

      if (action === 'cancel') {
        if (invoice.status === 'paid') {
          res.status(400).json({ error: 'Paid invoices cannot be cancelled' });
          return;
        }
        invoice.status = 'cancelled';
        await invoice.save();
        res.json(serializeInvoice(invoice.toObject() as unknown as Record<string, unknown>));
        return;
      }

      if (invoice.status !== 'draft') {
        res.status(400).json({ error: 'Only draft invoices can be edited' });
        return;
      }

      const data = upsertInvoiceSchema.parse(req.body);
      const money = computeInvoiceMoney(data.lineItems, data.gstRate, data.isInterState);
      invoice.customerName = data.customerName.trim();
      invoice.customerGstin = data.customerGstin?.trim();
      invoice.customerAddress = data.customerAddress?.trim();
      invoice.dueDate = data.dueDate ? new Date(data.dueDate) : undefined;
      invoice.gstRate = data.gstRate;
      invoice.isInterState = data.isInterState;
      invoice.notes = data.notes?.trim();
      Object.assign(invoice, moneyToDecimals(money));
      await invoice.save();
      res.json(serializeInvoice(invoice.toObject() as unknown as Record<string, unknown>));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors[0]?.message });
        return;
      }
      res.status(500).json({ error: 'Failed to update invoice' });
    }
  }
);

/**
 * POST /api/ventures/:ventureId/invoices/:invoiceId/mark-paid
 */
router.post(
  '/:invoiceId/mark-paid',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ventureId = String(req.params.ventureId);
      const invoice = await Invoice.findOne({ _id: req.params.invoiceId, ventureId });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const data = markPaidSchema.parse(req.body);
      const result = await markInvoicePaid({
        invoice,
        ventureId,
        partnerId: req.user!._id,
        bankAccountId: data.bankAccountId,
        paidFrom: data.paidFrom,
        remark: data.remark,
        date: data.date ? new Date(data.date) : new Date(),
        attachmentIds: data.attachmentIds,
      });

      res.json({
        invoice: serializeInvoice(result.invoice.toObject() as unknown as Record<string, unknown>),
        transactionId: result.transactionId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors[0]?.message });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to mark invoice paid' });
    }
  }
);

export default router;
