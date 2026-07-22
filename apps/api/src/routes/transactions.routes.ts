import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Transaction, Attachment, Venture, Partner, PartnerVenture, Invoice } from '../models/index.js';
import { AuthRequest, requireAuth, requireVentureAccess } from '../middleware/auth.middleware.js';
import { toDecimalString, toNumber } from '../utils/decimal.js';
import { getDownloadUrl } from '../services/r2.service.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';
import {
  assertBankAccountRequirement,
  assertEmiBeneficiary,
  createTxnSchema,
  resolveBankAccount,
  resolveCategoryFields,
} from '../utils/txnCreate.js';
import { assertSufficientBankBalance } from '../utils/bankBalance.js';
import { assertAttachmentsForCreate } from '../utils/attachments.js';
import { withTxn } from '../utils/withTxn.js';
import { AppError } from '../middleware/error.middleware.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

type TransactionLean = {
  _id: mongoose.Types.ObjectId;
  amount: mongoose.Types.Decimal128;
  [key: string]: unknown;
};

/**
 * Maps transaction documents to API response with attachments.
 * @param txns - Lean transaction documents
 */
async function mapTransactions(txns: TransactionLean[]) {
  const txnIds = txns.map((t) => t._id);
  const attachments = await Attachment.find({ transactionId: { $in: txnIds } }).lean();
  const attachMap = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const key = String(a.transactionId);
    if (!attachMap.has(key)) attachMap.set(key, []);
    attachMap.get(key)!.push(a);
  }

  return Promise.all(
    txns.map(async (t) => ({
      ...t,
      amount: toNumber(t.amount),
      bankAccountId: t.bankAccountId ? String(t.bankAccountId) : undefined,
      categoryId: t.categoryId ? String(t.categoryId) : undefined,
      beneficiaryPartnerId: t.beneficiaryPartnerId
        ? String(t.beneficiaryPartnerId)
        : undefined,
      attachments: await Promise.all(
        (attachMap.get(String(t._id)) ?? []).map(async (a) => ({
          id: a._id,
          fileName: a.fileName,
          fileType: a.fileType,
          downloadUrl: await getDownloadUrl(a.r2Key, a.publicUrl),
        }))
      ),
    }))
  );
}

/**
 * GET /api/ventures/:ventureId/transactions — paginated list with search & filters.
 */
router.get('/', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const { ventureId } = req.params;
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const { partnerId, mine, type, bankAccountId } = req.query;
  const regex = searchRegex(req.query.q);

  const filter: Record<string, unknown> = { ventureId, isDeleted: false };

  if (mine === 'true') {
    filter.partnerId = req.user!._id;
  } else if (partnerId && typeof partnerId === 'string' && partnerId !== 'all') {
    filter.partnerId = partnerId;
  }

  if (type && typeof type === 'string' && type !== 'all') {
    filter.type = type;
  }

  if (bankAccountId && typeof bankAccountId === 'string' && bankAccountId !== 'all') {
    filter.bankAccountId = bankAccountId;
  }

  if (regex) {
    filter.$or = [
      { remark: regex },
      { paidFrom: regex },
      { paidTo: regex },
      { bankAccountLabel: regex },
      { categoryName: regex },
      { emiPeriod: regex },
    ];
  }

  const [txns, total] = await Promise.all([
    Transaction.find(filter)
      .populate('partnerId', 'name email')
      .populate('beneficiaryPartnerId', 'name email')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  const items = await mapTransactions(txns);
  res.json(paginatedResult(items, total, page, limit));
});

/**
 * GET /api/ventures/:ventureId/transactions/partners — partners with entries (for filter dropdown).
 */
router.get('/partners', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const { ventureId } = req.params;
  const partnerIds = await Transaction.distinct('partnerId', { ventureId, isDeleted: false });
  const partners = await Partner.find({ _id: { $in: partnerIds } })
    .select('name email')
    .sort({ name: 1 })
    .lean();
  res.json(partners);
});

/**
 * POST /api/ventures/:ventureId/transactions — create an entry.
 */
router.post('/', requireVentureAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ventureId = String(req.params.ventureId);
    const venture = await Venture.findById(ventureId);
    if (!venture || venture.status === 'closed') {
      res.status(400).json({ error: 'Project is closed or not found' });
      return;
    }

    const data = createTxnSchema.parse(req.body);
    let partnerId: mongoose.Types.ObjectId = req.user!._id;
    if (req.user!.role === 'admin' && req.body.partnerId) {
      const raw = String(req.body.partnerId);
      if (!mongoose.Types.ObjectId.isValid(raw)) {
        res.status(400).json({ error: 'Invalid partnerId' });
        return;
      }
      const assigned = await PartnerVenture.findOne({ partnerId: raw, ventureId }).lean();
      if (!assigned) {
        res.status(400).json({ error: 'Partner is not assigned to this project' });
        return;
      }
      partnerId = new mongoose.Types.ObjectId(raw);
    }

    const bankReq = assertBankAccountRequirement(venture, data.type, data.bankAccountId);
    if (!bankReq.ok) {
      res.status(400).json({ error: bankReq.error });
      return;
    }

    let bankFields: { bankAccountId?: mongoose.Types.ObjectId; bankAccountLabel?: string } = {};
    if (data.bankAccountId) {
      const resolved = resolveBankAccount(venture, data.bankAccountId);
      if (!resolved) {
        res.status(400).json({ error: 'Invalid or inactive project bank account' });
        return;
      }
      bankFields = resolved;
    }

    const categoryResult = await resolveCategoryFields(ventureId, data);
    if (!categoryResult.ok) {
      res.status(400).json({ error: categoryResult.error });
      return;
    }

    const attachCheck = await assertAttachmentsForCreate(ventureId, data.attachmentIds);
    if (!attachCheck.ok) {
      res.status(400).json({ error: attachCheck.error });
      return;
    }

    let beneficiaryPartnerId: mongoose.Types.ObjectId | undefined;
    let emiPeriod: string | undefined;

    if (data.type === 'EMI_PERSONAL' || data.type === 'EMI_FROM_BANK') {
      const beneficiaryId =
        data.type === 'EMI_FROM_BANK' ? data.beneficiaryPartnerId! : String(partnerId);
      const emiCheck = await assertEmiBeneficiary(ventureId, beneficiaryId);
      if (!emiCheck.ok) {
        res.status(400).json({ error: emiCheck.error });
        return;
      }
      beneficiaryPartnerId = new mongoose.Types.ObjectId(beneficiaryId);
      emiPeriod = data.emiPeriod;
    }

    // Atomic write: serialize per-account (guard bump), re-check balance inside the
    // transaction, insert the entry, and link attachments — all or nothing.
    let txnId: mongoose.Types.ObjectId;
    try {
      txnId = await withTxn(async (session) => {
        if (bankFields.bankAccountId) {
          // Bumping txnSeq forces concurrent debits on the same account to
          // write-conflict, so withTxn retries the loser against a fresh balance.
          await Venture.updateOne(
            { _id: ventureId, 'bankAccounts._id': bankFields.bankAccountId },
            { $inc: { 'bankAccounts.$.txnSeq': 1 } },
            { session }
          );
          const balanceCheck = await assertSufficientBankBalance(
            ventureId,
            String(bankFields.bankAccountId),
            data.amount,
            data.type,
            session
          );
          if (!balanceCheck.ok) throw new AppError(balanceCheck.error, 400);
        }

        const [created] = await Transaction.create(
          [
            {
              ventureId,
              type: data.type,
              partnerId,
              amount: mongoose.Types.Decimal128.fromString(toDecimalString(data.amount)),
              date: new Date(data.date),
              paidFrom: data.paidFrom?.trim() || undefined,
              paidTo: data.paidTo?.trim() || undefined,
              remark: data.remark?.trim() || undefined,
              ...bankFields,
              ...categoryResult.fields,
              beneficiaryPartnerId,
              emiPeriod,
              createdById: req.user!._id,
            },
          ],
          { session }
        );

        if (data.attachmentIds?.length) {
          await Attachment.updateMany(
            { _id: { $in: data.attachmentIds }, ventureId },
            { transactionId: created._id },
            { session }
          );
        }
        return created._id;
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }

    const populated = await Transaction.findById(txnId)
      .populate('partnerId', 'name email')
      .populate('beneficiaryPartnerId', 'name email')
      .lean();
    res.status(201).json({
      ...populated,
      amount: toNumber(populated!.amount),
      bankAccountId: populated?.bankAccountId ? String(populated.bankAccountId) : undefined,
      categoryId: populated?.categoryId ? String(populated.categoryId) : undefined,
      beneficiaryPartnerId: populated?.beneficiaryPartnerId
        ? String(
            typeof populated.beneficiaryPartnerId === 'object' &&
              populated.beneficiaryPartnerId !== null &&
              '_id' in populated.beneficiaryPartnerId
              ? (populated.beneficiaryPartnerId as { _id: mongoose.Types.ObjectId })._id
              : populated.beneficiaryPartnerId
          )
        : undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

/**
 * DELETE /api/ventures/:ventureId/transactions/:txnId — soft-void an entry.
 * Allowed for admin or the partner who created the entry. Blocked on closed projects.
 */
router.delete(
  '/:txnId',
  requireVentureAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ventureId = String(req.params.ventureId);
      const txnId = String(req.params.txnId);

      if (!mongoose.Types.ObjectId.isValid(txnId)) {
        res.status(400).json({ error: 'Invalid entry id' });
        return;
      }

      const venture = await Venture.findById(ventureId).lean();
      if (!venture) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (venture.status === 'closed') {
        res.status(400).json({ error: 'Cannot void entries on a closed project' });
        return;
      }

      const txn = await Transaction.findOne({ _id: txnId, ventureId, isDeleted: false });
      if (!txn) {
        res.status(404).json({ error: 'Entry not found' });
        return;
      }

      const isAdmin = req.user!.role === 'admin';
      const isCreator = String(txn.createdById) === String(req.user!._id);
      const isOwner = String(txn.partnerId) === String(req.user!._id);
      if (!isAdmin && !isCreator && !isOwner) {
        res.status(403).json({ error: 'You can only void your own entries' });
        return;
      }

      // Voiding a paid-invoice earning would desync the invoice from the ledger.
      if (txn.type === 'EARNING_IN') {
        const linkedInvoice = await Invoice.findOne({
          linkedEarningTransactionId: txn._id,
          status: 'paid',
        })
          .select('number')
          .lean();
        if (linkedInvoice) {
          res.status(400).json({
            error: `This earning is linked to paid invoice ${linkedInvoice.number ?? ''}. Un-mark the invoice as paid before voiding.`,
          });
          return;
        }
      }

      txn.isDeleted = true;
      txn.deletedAt = new Date();
      txn.deletedById = req.user!._id;
      await txn.save();

      res.json({ ok: true, id: String(txn._id) });
    } catch {
      res.status(500).json({ error: 'Failed to void entry' });
    }
  }
);

export default router;
