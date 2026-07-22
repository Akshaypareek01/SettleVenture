import mongoose, { Schema, Document, Types } from 'mongoose';

export type PartnerRole = 'partner' | 'admin';

export interface IPartner extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: PartnerRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['partner', 'admin'], default: 'partner' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Partner = mongoose.model<IPartner>('Partner', partnerSchema);
