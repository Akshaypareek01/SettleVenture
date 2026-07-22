import mongoose, { Schema, Document, Types } from 'mongoose';

/** Many-to-many: which partners can access which ventures (+ optional EMI/loan config). */
export interface IPartnerVenture extends Document {
  _id: Types.ObjectId;
  partnerId: Types.ObjectId;
  ventureId: Types.ObjectId;
  assignedAt: Date;
  assignedById: Types.ObjectId;
  loanAmount?: Types.Decimal128;
  monthlyEmi?: Types.Decimal128;
  emiStartDate?: Date;
  tenureMonths?: number;
  isEmiActive: boolean;
}

const partnerVentureSchema = new Schema<IPartnerVenture>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    ventureId: { type: Schema.Types.ObjectId, ref: 'Venture', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedById: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    loanAmount: { type: Schema.Types.Decimal128 },
    monthlyEmi: { type: Schema.Types.Decimal128 },
    emiStartDate: { type: Date },
    tenureMonths: { type: Number, min: 1 },
    isEmiActive: { type: Boolean, default: false },
  },
  { timestamps: false }
);

partnerVentureSchema.index({ partnerId: 1, ventureId: 1 }, { unique: true });
partnerVentureSchema.index({ ventureId: 1 });

export const PartnerVenture = mongoose.model<IPartnerVenture>('PartnerVenture', partnerVentureSchema);
