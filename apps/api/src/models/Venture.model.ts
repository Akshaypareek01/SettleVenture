import mongoose, { Schema, Document, Types } from 'mongoose';

export type VentureStatus = 'active' | 'closed';

export interface IBankAccount {
  _id: Types.ObjectId;
  label: string;
  bankName?: string;
  accountHint?: string;
  isActive: boolean;
  /** Bumped inside each bank-affecting transaction to serialize concurrent debits. */
  txnSeq: number;
  createdAt: Date;
}

export interface IVenture extends Document {
  _id: Types.ObjectId;
  name: string;
  ventureTypeId: Types.ObjectId;
  description?: string;
  status: VentureStatus;
  metadata: Record<string, unknown>;
  bankAccounts: IBankAccount[];
  createdAt: Date;
  updatedAt: Date;
}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    label: { type: String, required: true, trim: true },
    bankName: { type: String, trim: true },
    accountHint: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    txnSeq: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ventureSchema = new Schema<IVenture>(
  {
    name: { type: String, required: true, trim: true },
    ventureTypeId: { type: Schema.Types.ObjectId, ref: 'VentureType', required: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    bankAccounts: { type: [bankAccountSchema], default: [] },
  },
  { timestamps: true }
);

ventureSchema.index({ ventureTypeId: 1, status: 1 });

export const Venture = mongoose.model<IVenture>('Venture', ventureSchema);
