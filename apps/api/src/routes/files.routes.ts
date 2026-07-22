import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Attachment, Venture, PartnerVenture } from '../models/index.js';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware.js';
import {
  presignUpload,
  storeFile,
  buildStorageKey,
  getDownloadUrl,
  deleteFile,
  readLocalFile,
} from '../services/r2.service.js';
import { env, isR2Configured } from '../config/env.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

router.use(requireAuth);

/**
 * Checks if user can access a venture (admin or assigned partner).
 * @param user - Authenticated partner
 * @param ventureId - Venture ID string
 */
async function canAccessVenture(user: AuthRequest['user'], ventureId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const assignment = await PartnerVenture.findOne({ partnerId: user._id, ventureId });
  return Boolean(assignment);
}

const confirmSchema = z.object({
  ventureId: z.string(),
  r2Key: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSizeBytes: z.number(),
  transactionId: z.string().optional(),
});

/**
 * POST /api/files/upload — direct upload (mock/local or returns presign for R2).
 */
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ventureId = req.body.ventureId as string;
    if (!ventureId || !req.file) {
      res.status(400).json({ error: 'ventureId and file required' });
      return;
    }
    if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }
    if (!(await canAccessVenture(req.user, ventureId))) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }

    const r2Key = buildStorageKey(ventureId, req.file.originalname);
    await storeFile(r2Key, req.file.buffer, req.file.mimetype);

    const attachment = await Attachment.create({
      ventureId,
      r2Key,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      uploadedById: req.user!._id,
    });

    const downloadUrl = await getDownloadUrl(r2Key);
    res.status(201).json({ id: attachment._id, downloadUrl, r2Key });
  } catch (err) {
    console.error('[files/upload]', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/presign — presigned URL for R2 direct upload.
 */
router.post('/presign', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ventureId, fileName, fileType, fileSize } = req.body;
    if (!ventureId || !fileName || !fileType) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (!(await canAccessVenture(req.user, ventureId))) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }
    if (!isR2Configured()) {
      res.json({ useDirectUpload: true, endpoint: '/api/files/upload' });
      return;
    }
    const result = await presignUpload(ventureId, fileName, fileType);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Presign failed' });
  }
});

/**
 * POST /api/files/confirm — save attachment after R2 upload.
 */
router.post('/confirm', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = confirmSchema.parse(req.body);
    if (!(await canAccessVenture(req.user, data.ventureId))) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }
    const attachment = await Attachment.create({
      ventureId: data.ventureId,
      transactionId: data.transactionId,
      r2Key: data.r2Key,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSizeBytes: data.fileSizeBytes,
      uploadedById: req.user!._id,
    });
    const downloadUrl = await getDownloadUrl(data.r2Key);
    res.status(201).json({ id: attachment._id, downloadUrl });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Confirm failed' });
  }
});

/**
 * GET /api/files/local/* — serve local mock files.
 */
router.get('/local/*', async (req: AuthRequest, res: Response): Promise<void> => {
  const key = req.params[0];
  if (!key) {
    res.status(400).json({ error: 'Missing key' });
    return;
  }
  try {
    const decoded = decodeURIComponent(key);
    const { buffer, contentType } = await readLocalFile(decoded);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * GET /api/files/venture/:ventureId — all documents in a project.
 */
router.get('/venture/:ventureId', async (req: AuthRequest, res: Response): Promise<void> => {
  const ventureId = String(req.params.ventureId);
  if (!(await canAccessVenture(req.user, ventureId))) {
    res.status(403).json({ error: 'You are not assigned to this project' });
    return;
  }

  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const regex = searchRegex(req.query.q);
  const filter: Record<string, unknown> = { ventureId };
  if (regex) filter.fileName = regex;

  const [attachments, total] = await Promise.all([
    Attachment.find(filter)
      .populate('uploadedById', 'name')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Attachment.countDocuments(filter),
  ]);

  const items = await Promise.all(
    attachments.map(async (a) => ({
      id: a._id,
      fileName: a.fileName,
      fileType: a.fileType,
      fileSizeBytes: a.fileSizeBytes,
      uploadedBy: a.uploadedById,
      uploadedAt: a.uploadedAt,
      downloadUrl: await getDownloadUrl(a.r2Key),
    }))
  );

  res.json(paginatedResult(items, total, page, limit));
});

/**
 * GET /api/files/:id/download — download URL for attachment.
 */
router.get('/:id/download', async (req: AuthRequest, res: Response): Promise<void> => {
  const attachment = await Attachment.findById(req.params.id);
  if (!attachment) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (!(await canAccessVenture(req.user, String(attachment.ventureId)))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const url = await getDownloadUrl(attachment.r2Key);
  res.json({ url });
});

/**
 * DELETE /api/files/:id — remove attachment (admin only for now).
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const attachment = await Attachment.findById(req.params.id);
  if (!attachment) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (req.user!.role !== 'admin' && String(attachment.uploadedById) !== String(req.user!._id)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await deleteFile(attachment.r2Key);
  await attachment.deleteOne();
  res.json({ ok: true });
});

export default router;
