import { useCallback, useEffect, useState } from 'react';
import { api, PaginatedResult } from '../lib/api';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../lib/pagination';

interface UsePaginatedListOptions {
  /** Initial filter values */
  initialFilters?: Record<string, string>;
  /** Debounce search ms */
  debounceMs?: number;
  /** Page size */
  limit?: number;
  /** When false, skip fetching */
  enabled?: boolean;
}

/**
 * Fetches a paginated list with search, filters, and page controls.
 * @param basePath - API path without query string
 * @param options - Hook configuration
 */
export function usePaginatedList<T>(
  basePath: string,
  options: UsePaginatedListOptions = {}
) {
  const { initialFilters = {}, debounceMs = 300, limit: initialLimit = DEFAULT_PAGE_SIZE, enabled = true } = options;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [result, setResult] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(t);
  }, [search, debounceMs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, limit]);

  const fetchList = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery({ page, limit, q: debouncedSearch, ...filters });
      const data = await api<PaginatedResult<T>>(`${basePath}${qs}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [basePath, page, limit, debouncedSearch, filters, enabled]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return {
    items: result?.items ?? [],
    pagination: result?.pagination,
    loading,
    error,
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch,
    filters,
    setFilter,
    refresh: fetchList,
  };
}
