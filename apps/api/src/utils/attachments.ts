import mongoose from 'mongoose';
import { Attachment } from '../models/index.js';

/**
 * Validates attachment ids belong to the venture and are not already linked to another txn.
 * @param ventureId - Venture id
 * @param attachmentIds - Client-supplied attachment ids
 */
export async function assertAttachmentsForCreate(
  ventureId: string,
  attachmentIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!attachmentIds.length) {
    return { ok: false, error: 'Proof attachment is required' };
  }

  const uniqueIds = [...new Set(attachmentIds)];
  for (const id of uniqueIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false, error: 'Invalid attachment id' };
    }
  }

  const attachments = await Attachment.find({ _id: { $in: uniqueIds } }).lean();
  if (attachments.length !== uniqueIds.length) {
    return { ok: false, error: 'One or more proof files were not found' };
  }

  for (const att of attachments) {
    if (String(att.ventureId) !== String(ventureId)) {
      return { ok: false, error: 'Proof file does not belong to this project' };
    }
    if (att.transactionId) {
      return { ok: false, error: 'Proof file is already linked to another entry' };
    }
  }

  return { ok: true };
}
