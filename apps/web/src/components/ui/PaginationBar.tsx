import type { PaginationMeta } from '../../lib/api';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';

interface PaginationBarProps {
  pagination?: PaginationMeta;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  loading?: boolean;
}

/**
 * Pagination controls with page size selector.
 */
export default function PaginationBar({
  pagination,
  page,
  limit,
  onPageChange,
  onLimitChange,
  loading = false,
}: PaginationBarProps) {
  if (!pagination || pagination.total === 0) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, pagination.total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
      <p className="text-sm text-muted">
        Showing {start}–{end} of {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="page-size" className="text-sm text-muted sr-only">
          Page size
        </label>
        <select
          id="page-size"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="input-field py-1.5 text-sm w-20"
          aria-label="Items per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!pagination.hasPrev || loading}
          className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="text-sm text-muted px-1">
          {page} / {pagination.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!pagination.hasNext || loading}
          className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}
