import { useRef } from 'react';
import { Upload, X } from 'lucide-react';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

interface ProofUploadFieldProps {
  file: File | null;
  preview: string | null;
  onFileChange: (file: File | null) => void;
}

/**
 * Proof file picker with image preview and clear action.
 */
export default function ProofUploadField({
  file,
  preview,
  onFileChange,
}: ProofUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="block text-sm font-medium mb-2">
        Screenshot / proof <span className="text-red-400">*</span>
      </label>
      <p className="text-xs text-muted mb-2">JPEG, PNG, WebP, or PDF · max 10 MB</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        aria-label="Upload proof"
        aria-required="true"
      />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={preview} alt="Proof preview" className="w-full max-h-48 object-cover" />
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
            aria-label="Remove screenshot"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : file ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{file.name}</span>
          <button type="button" onClick={() => onFileChange(null)} aria-label="Remove file">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted hover:border-accent/50 hover:text-accent transition-colors"
        >
          <Upload className="w-8 h-8" aria-hidden="true" />
          <span className="text-sm">Tap to upload screenshot or PDF</span>
        </button>
      )}
    </div>
  );
}

/**
 * Validates proof file type and size.
 * @param f - Selected file
 * @returns Error message or null if valid
 */
export function validateProofFile(f: File): string | null {
  if (!ALLOWED_FILE_TYPES.includes(f.type)) {
    return 'Proof must be JPEG, PNG, WebP, or PDF';
  }
  if (f.size > MAX_FILE_BYTES) {
    return 'Proof must be 10 MB or smaller';
  }
  return null;
}
