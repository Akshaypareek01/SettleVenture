import { useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, FileText, X } from 'lucide-react';

export interface AttachmentPreviewItem {
  id: string;
  fileName: string;
  fileType?: string;
  downloadUrl: string;
}

interface AttachmentPreviewProps {
  attachments: AttachmentPreviewItem[];
}

/**
 * Returns true when the attachment should render as an image thumbnail.
 * @param fileType - MIME type from API
 * @param fileName - Fallback extension check
 */
function isImageAttachment(fileType?: string, fileName?: string): boolean {
  if (fileType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(fileName ?? '');
}

/**
 * Thumbnail strip + lightbox viewer for entry proof attachments.
 */
export default function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  const [active, setActive] = useState<AttachmentPreviewItem | null>(null);

  if (!attachments.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3 shrink-0">
        {attachments.map((a) => {
          const image = isImageAttachment(a.fileType, a.fileName);
          return (
            <div key={a.id} className="w-36 space-y-2">
              <button
                type="button"
                onClick={() => setActive(a)}
                className="group relative w-full aspect-square rounded-xl overflow-hidden border border-border bg-elevated focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label={`View ${a.fileName}`}
              >
                {image ? (
                  <img
                    src={a.downloadUrl}
                    alt={a.fileName}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted">
                    <FileText className="w-8 h-8 text-accent" aria-hidden="true" />
                    <span className="text-xs px-2 text-center truncate w-full">{a.fileName}</span>
                  </div>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                </span>
              </button>
              <p className="text-xs text-muted truncate" title={a.fileName}>
                {a.fileName}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActive(a)}
                  className="btn-secondary flex-1 py-1.5 text-xs flex items-center justify-center gap-1"
                  aria-label={`View ${a.fileName}`}
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  View
                </button>
                <a
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary py-1.5 px-2 text-xs"
                  aria-label={`Open ${a.fileName} in new tab`}
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <AttachmentLightbox attachment={active} onClose={() => setActive(null)} />
      )}
    </>
  );
}

interface AttachmentLightboxProps {
  attachment: AttachmentPreviewItem;
  onClose: () => void;
}

/**
 * Full-screen proof viewer with open/download actions.
 */
function AttachmentLightbox({ attachment, onClose }: AttachmentLightboxProps) {
  const image = isImageAttachment(attachment.fileType, attachment.fileName);

  useEffect(() => {
    /**
     * Closes lightbox on Escape.
     * @param e - Keyboard event
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${attachment.fileName}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-200 truncate font-medium">{attachment.fileName}</p>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={attachment.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"
              aria-label="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Open
            </a>
            <a
              href={attachment.downloadUrl}
              download={attachment.fileName}
              className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"
              aria-label="Download file"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-1.5 px-2"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-border bg-elevated flex items-center justify-center min-h-[280px] max-h-[75vh]">
          {image ? (
            <img
              src={attachment.downloadUrl}
              alt={attachment.fileName}
              className="max-w-full max-h-[75vh] object-contain"
            />
          ) : (
            <iframe
              src={attachment.downloadUrl}
              title={attachment.fileName}
              className="w-full h-[70vh] bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
