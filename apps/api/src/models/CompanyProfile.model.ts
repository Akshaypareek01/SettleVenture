import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICompanyProfile extends Document {
  _id: Types.ObjectId;
  firmName: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountHint?: string;
  ifsc?: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const companyProfileSchema = new Schema<ICompanyProfile>(
  {
    firmName: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    gstin: { type: String, trim: true },
    pan: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    bankName: { type: String, trim: true },
    bankAccountHint: { type: String, trim: true },
    ifsc: { type: String, trim: true },
    invoicePrefix: { type: String, required: true, trim: true, default: 'AL-' },
    nextInvoiceNumber: { type: Number, required: true, default: 1, min: 1 },
  },
  { timestamps: true }
);

export const CompanyProfile = mongoose.model<ICompanyProfile>(
  'CompanyProfile',
  companyProfileSchema
);
