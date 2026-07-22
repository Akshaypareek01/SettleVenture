import { Types } from 'mongoose';
import { Attachment, PartnerVenture, Transaction, Venture, Invoice } from '../models/index.js';
import { deleteFile } from './r2.service.js';

/**
 * Removes all R2 objects for attachment documents.
 * @param attachments - Attachment docs with r2Key
 */
async function deleteAttachmentFiles(
  attachments: Array<{ r2Key: string }>
): Promise<void> {
  for (const file of attachments) {
    try {
      await deleteFile(file.r2Key);
    } catch {
      /* continue if file missing in storage */
    }
  }
}

/**
 * Hard-deletes all data tied to a venture (transactions, files, assignments).
 * @param ventureId - Venture ObjectId
 */
export async function cascadeDeleteVenture(ventureId: Types.ObjectId): Promise<void> {
  const attachments = await Attachment.find({ ventureId }).lean();
  await deleteAttachmentFiles(attachments);
  await Attachment.deleteMany({ ventureId });
  await Transaction.deleteMany({ ventureId });
  await Invoice.deleteMany({ ventureId });
  await PartnerVenture.deleteMany({ ventureId });
}

/**
 * Hard-deletes partner assignments and their investment records.
 * @param partnerId - Partner ObjectId
 */
export async function cascadeDeletePartner(partnerId: Types.ObjectId): Promise<void> {
  const txns = await Transaction.find({ partnerId }).lean();
  const txnIds = txns.map((t) => t._id);
  const txnAttachments = await Attachment.find({ transactionId: { $in: txnIds } }).lean();
  await deleteAttachmentFiles(txnAttachments);
  await Attachment.deleteMany({ transactionId: { $in: txnIds } });
  await Transaction.deleteMany({ partnerId });
  // Bank-paid EMIs where this partner was the beneficiary (but not the payer)
  // stay on the ledger — clear the dangling beneficiary reference.
  await Transaction.updateMany(
    { beneficiaryPartnerId: partnerId },
    { $unset: { beneficiaryPartnerId: '' } }
  );
  await PartnerVenture.deleteMany({ partnerId });
}

/**
 * Deletes all ventures of a type plus the type itself.
 * @param typeId - VentureType ObjectId
 */
export async function cascadeDeleteVentureType(typeId: Types.ObjectId): Promise<void> {
  const ventures = await Venture.find({ ventureTypeId: typeId });
  for (const venture of ventures) {
    await cascadeDeleteVenture(venture._id);
    await venture.deleteOne();
  }
}
