import { Router, Response } from 'express';
import { z } from 'zod';
import { CompanyProfile } from '../models/index.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { getOrCreateCompanyProfile } from '../services/invoice.service.js';

const router = Router();

const profileSchema = z.object({
  firmName: z.string().min(2),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  bankName: z.string().optional(),
  bankAccountHint: z.string().optional(),
  ifsc: z.string().optional(),
  invoicePrefix: z.string().min(1).max(20).optional(),
  nextInvoiceNumber: z.number().int().positive().optional(),
});

/**
 * GET /api/admin/company-profile
 */
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOrCreateCompanyProfile();
  res.json(profile);
});

/**
 * PUT /api/admin/company-profile — upsert firm details used on invoices.
 */
router.put('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = profileSchema.parse(req.body);
    // Ensure the single canonical profile exists, then update it by singletonKey
    // so we never fork a second document.
    await getOrCreateCompanyProfile();
    const payload = {
      firmName: data.firmName.trim(),
      address: data.address?.trim(),
      city: data.city?.trim(),
      state: data.state?.trim(),
      pincode: data.pincode?.trim(),
      gstin: data.gstin?.trim(),
      pan: data.pan?.trim(),
      phone: data.phone?.trim(),
      email: data.email?.trim() || undefined,
      bankName: data.bankName?.trim(),
      bankAccountHint: data.bankAccountHint?.trim(),
      ifsc: data.ifsc?.trim(),
      ...(data.invoicePrefix ? { invoicePrefix: data.invoicePrefix.trim() } : {}),
      ...(data.nextInvoiceNumber !== undefined
        ? { nextInvoiceNumber: data.nextInvoiceNumber }
        : {}),
    };

    const profile = await CompanyProfile.findOneAndUpdate(
      { singletonKey: 'company' },
      payload,
      { new: true }
    ).lean();

    res.json(profile);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message });
      return;
    }
    res.status(500).json({ error: 'Failed to save company profile' });
  }
});

export default router;
