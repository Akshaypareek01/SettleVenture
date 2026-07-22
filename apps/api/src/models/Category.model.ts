import mongoose, { Schema, Document, Types } from 'mongoose';

export type CategoryDirection = 'IN' | 'OUT';

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  direction: CategoryDirection;
  systemKey?: string;
  isActive: boolean;
  ventureId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    systemKey: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    ventureId: { type: Schema.Types.ObjectId, ref: 'Venture', default: null },
  },
  { timestamps: true }
);

categorySchema.index({ direction: 1, isActive: 1 });
categorySchema.index({ systemKey: 1 }, { sparse: true });
categorySchema.index({ ventureId: 1, name: 1 });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
