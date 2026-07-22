import { Router, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Attachment, PartnerVenture } from '../models/index.js';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware.js';
import {
  presignUpload,
  storeFile,
  buildStorageKey,
  resolveFileUrl,
  deleteFile,
} from '../services/r2.service.js';
import { assertFileStorageReady } from '../config/env.js';
import { env } from '../config/env.js';
import { parsePagination, paginatedResult, searchRegex } from '../utils/pagination.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many file requests, please slow down' },
});

router.use(requireAuth);

/**
 * Checks that a client-supplied r2Key belongs to the given venture's proofs
 * folder and cannot address anything else in the bucket.
 * Must mirror the shape produced by buildStorageKey().
 * @param r2Key - Storage key from the client
 * @param ventureId - Venture the attachment claims to belong to
 */
function isValidVentureKey(r2Key: string, ventureId: string): boolean {
  if (!/^[a-f0-9]{24}$/i.test(ventureId)) return false;
  if (r2Key.includes('..') || r2Key.includes('\\')) return false;
  const pattern = new RegExp(`^ventures/${ventureId}/proofs/[a-zA-Z0-9._-]+$`);
  return pattern.test(r2Key);
}

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
  ventureId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid venture id'),
  r2Key: z.string().max(512),
  fileName: z.string().min(1).max(255),
  fileType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(env.MAX_FILE_SIZE_MB * 1024 * 1024, 'File exceeds size limit'),
  transactionId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

/**
 * POST /api/files/upload — upload proof to R2, return public URL.
 */
router.post('/upload', uploadLimiter, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertFileStorageReady();

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
    const publicUrl = await storeFile(r2Key, req.file.buffer, req.file.mimetype);

    const attachment = await Attachment.create({
      ventureId,
      r2Key,
      publicUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      uploadedById: req.user!._id,
    });

    res.status(201).json({ id: attachment._id, downloadUrl: publicUrl, publicUrl, r2Key });
  } catch (err) {
    console.error('[files/upload]', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/presign — presigned URL for direct R2 upload from browser.
 */
router.post('/presign', uploadLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertFileStorageReady();
    const { ventureId, fileName, fileType } = req.body;
    if (typeof ventureId !== 'string' || typeof fileName !== 'string' || typeof fileType !== 'string'
      || !ventureId || !fileName || !fileType) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (!ALLOWED_TYPES.includes(fileType)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }
    if (!(await canAccessVenture(req.user, ventureId))) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }
    const result = await presignUpload(ventureId, fileName, fileType);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Presign failed';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/confirm — save attachment record after client uploaded to R2.
 */
router.post('/confirm', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertFileStorageReady();
    const data = confirmSchema.parse(req.body);
    if (!(await canAccessVenture(req.user, data.ventureId))) {
      res.status(403).json({ error: 'You are not assigned to this project' });
      return;
    }
    if (!isValidVentureKey(data.r2Key, data.ventureId)) {
      res.status(400).json({ error: 'Invalid storage key for this project' });
      return;
    }
    const existing = await Attachment.findOne({ r2Key: data.r2Key });
    if (existing) {
      res.status(409).json({ error: 'This file is already registered' });
      return;
    }
    const publicUrl = resolveFileUrl(data.r2Key);
    const attachment = await Attachment.create({
      ventureId: data.ventureId,
      transactionId: data.transactionId,
      r2Key: data.r2Key,
      publicUrl,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSizeBytes: data.fileSizeBytes,
      uploadedById: req.user!._id,
    });
    res.status(201).json({ id: attachment._id, downloadUrl: publicUrl, publicUrl });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Confirm failed';
    res.status(500).json({ error: message });
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

  const items = attachments.map((a) => ({
    id: a._id,
    fileName: a.fileName,
    fileType: a.fileType,
    fileSizeBytes: a.fileSizeBytes,
    uploadedBy: a.uploadedById,
    uploadedAt: a.uploadedAt,
    downloadUrl: resolveFileUrl(a.r2Key, a.publicUrl),
    publicUrl: a.publicUrl ?? resolveFileUrl(a.r2Key),
  }));

  res.json(paginatedResult(items, total, page, limit));
});

/**
 * GET /api/files/:id/download — public URL for attachment.
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
  const url = resolveFileUrl(attachment.r2Key, attachment.publicUrl);
  res.json({ url, publicUrl: url });
});

/**
 * DELETE /api/files/:id — remove attachment from R2 and database.
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
