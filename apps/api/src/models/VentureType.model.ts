import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVentureType extends Document {
  _id: Types.ObjectId;
  slug: string;
  label: string;
  icon: string;
  colorHex: string;
  isActive: boolean;
  sortOrder: number;
}

const ventureTypeSchema = new Schema<IVentureType>(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    icon: { type: String, required: true, default: 'folder' },
    colorHex: { type: String, required: true, default: '#22c55e' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const VentureType = mongoose.model<IVentureType>('VentureType', ventureTypeSchema);
