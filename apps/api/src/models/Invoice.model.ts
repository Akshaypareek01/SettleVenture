import mongoose, { Schema, Document, Types } from 'mongoose';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

export interface IInvoiceLineItem {
  description: string;
  qty: number;
  rate: Types.Decimal128;
  amount: Types.Decimal128;
}

export interface ICompanySnapshot {
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
}

export interface IInvoice extends Document {
  _id: Types.ObjectId;
  ventureId: Types.ObjectId;
  number?: string;
  status: InvoiceStatus;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  issueDate?: Date;
  dueDate?: Date;
  lineItems: IInvoiceLineItem[];
  taxableAmount: Types.Decimal128;
  gstRate: number;
  gstAmount: Types.Decimal128;
  cgst: Types.Decimal128;
  sgst: Types.Decimal128;
  igst: Types.Decimal128;
  isInterState: boolean;
  totalAmount: Types.Decimal128;
  notes?: string;
  companySnapshot?: ICompanySnapshot;
  createdById: Types.ObjectId;
  linkedEarningTransactionId?: Types.ObjectId;
  linkedBankAccountId?: Types.ObjectId;
  linkedBankAccountLabel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Schema.Types.Decimal128, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
  },
  { _id: false }
);

const companySnapshotSchema = new Schema<ICompanySnapshot>(
  {
    firmName: { type: String, required: true },
    address: String,
    city: String,
    state: String,
    pincode: String,
    gstin: String,
    pan: String,
    phone: String,
    email: String,
    bankName: String,
    bankAccountHint: String,
    ifsc: String,
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    ventureId: { type: Schema.Types.ObjectId, ref: 'Venture', required: true },
    number: { type: String, trim: true },
    status: {
      type: String,
      enum: ['draft', 'issued', 'paid', 'cancelled'],
      default: 'draft',
      required: true,
    },
    customerName: { type: String, required: true, trim: true },
    customerGstin: { type: String, trim: true },
    customerAddress: { type: String, trim: true },
    issueDate: { type: Date },
    dueDate: { type: Date },
    lineItems: { type: [lineItemSchema], default: [] },
    taxableAmount: { type: Schema.Types.Decimal128, required: true },
    gstRate: { type: Number, required: true, default: 18 },
    gstAmount: { type: Schema.Types.Decimal128, required: true },
    cgst: { type: Schema.Types.Decimal128, required: true },
    sgst: { type: Schema.Types.Decimal128, required: true },
    igst: { type: Schema.Types.Decimal128, required: true },
    isInterState: { type: Boolean, default: false },
    totalAmount: { type: Schema.Types.Decimal128, required: true },
    notes: { type: String, trim: true },
    companySnapshot: { type: companySnapshotSchema },
    createdById: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    linkedEarningTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    linkedBankAccountId: { type: Schema.Types.ObjectId },
    linkedBankAccountLabel: { type: String, trim: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ ventureId: 1, createdAt: -1 });
invoiceSchema.index({ ventureId: 1, status: 1 });
invoiceSchema.index({ number: 1 }, { unique: true, sparse: true });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
