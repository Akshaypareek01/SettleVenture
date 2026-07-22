import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAttachment extends Document {
  _id: Types.ObjectId;
  ventureId: Types.ObjectId;
  transactionId?: Types.ObjectId;
  r2Key: string;
  publicUrl?: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedById: Types.ObjectId;
  uploadedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
  {
    ventureId: { type: Schema.Types.ObjectId, ref: 'Venture', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    r2Key: { type: String, required: true },
    publicUrl: { type: String, trim: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSizeBytes: { type: Number, required: true },
    uploadedById: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

attachmentSchema.index({ ventureId: 1 });
attachmentSchema.index({ transactionId: 1 });

export const Attachment = mongoose.model<IAttachment>('Attachment', attachmentSchema);
