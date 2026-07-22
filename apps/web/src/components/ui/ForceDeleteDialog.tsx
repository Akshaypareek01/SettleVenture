import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

const DEFAULT_PHRASE = 'DELETE';

interface ForceDeleteDialogProps {
  title: string;
  message: ReactNode;
  confirmPhrase?: string;
  itemName?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive delete dialog — admin must type DELETE (or custom phrase) to confirm.
 */
export default function ForceDeleteDialog({
  title,
  message,
  confirmPhrase = DEFAULT_PHRASE,
  itemName,
  loading = false,
  onConfirm,
  onCancel,
}: ForceDeleteDialogProps) {
  const [input, setInput] = useState('');
  const matched = input.trim().toUpperCase() === confirmPhrase.toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="force-delete-title"
    >
      <div className="card max-w-md w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 id="force-delete-title" className="font-semibold text-lg text-red-400">
              {title}
            </h3>
            <div className="text-sm text-muted mt-2 space-y-2">{message}</div>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="force-confirm" className="block text-sm font-medium mb-2">
            Type <span className="font-mono text-red-400">{confirmPhrase}</span> to force delete
            {itemName ? ` "${itemName}"` : ''}
          </label>
          <input
            id="force-confirm"
            className="input-field font-mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmPhrase}
            autoComplete="off"
            aria-label={`Type ${confirmPhrase} to confirm force delete`}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matched || loading}
            className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting...' : 'Force Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
