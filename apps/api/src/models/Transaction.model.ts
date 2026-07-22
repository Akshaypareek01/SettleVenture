import mongoose, { Schema, Document, Types } from 'mongoose';

export type TransactionType =
  | 'CONTRIBUTION_IN'
  | 'VENDOR_PAYMENT_OUT'
  | 'EXPENSE'
  | 'EARNING_IN'
  | 'EMI_PERSONAL'
  | 'EMI_FROM_BANK';

export interface ITransaction extends Document {
  _id: Types.ObjectId;
  ventureId: Types.ObjectId;
  type: TransactionType;
  partnerId: Types.ObjectId;
  amount: Types.Decimal128;
  date: Date;
  paidFrom?: string;
  paidTo?: string;
  remark?: string;
  bankAccountId?: Types.ObjectId;
  bankAccountLabel?: string;
  categoryId?: Types.ObjectId;
  categoryName?: string;
  beneficiaryPartnerId?: Types.ObjectId;
  emiPeriod?: string;
  createdById: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedById?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    ventureId: { type: Schema.Types.ObjectId, ref: 'Venture', required: true },
    type: {
      type: String,
      enum: [
        'CONTRIBUTION_IN',
        'VENDOR_PAYMENT_OUT',
        'EXPENSE',
        'EARNING_IN',
        'EMI_PERSONAL',
        'EMI_FROM_BANK',
      ],
      required: true,
    },
    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    date: { type: Date, required: true, default: Date.now },
    paidFrom: { type: String, trim: true },
    paidTo: { type: String, trim: true },
    remark: { type: String, trim: true },
    bankAccountId: { type: Schema.Types.ObjectId },
    bankAccountLabel: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    categoryName: { type: String, trim: true },
    beneficiaryPartnerId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    emiPeriod: { type: String, trim: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedById: { type: Schema.Types.ObjectId, ref: 'Partner' },
  },
  { timestamps: true }
);

transactionSchema.index({ ventureId: 1, date: -1 });
transactionSchema.index({ ventureId: 1, partnerId: 1 });
transactionSchema.index({ ventureId: 1, bankAccountId: 1, date: -1 });
transactionSchema.index({ ventureId: 1, beneficiaryPartnerId: 1, emiPeriod: 1 });
transactionSchema.index({ isDeleted: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
