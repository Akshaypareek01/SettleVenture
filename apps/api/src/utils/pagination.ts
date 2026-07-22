/**
 * Parsed pagination query parameters.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Standard paginated API response shape.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Parses page and limit from query string with sane bounds.
 * @param query - Express query object
 * @param defaultLimit - Default page size
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 10
): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Builds paginated response metadata.
 * @param items - Page items
 * @param total - Total matching count
 * @param page - Current page
 * @param limit - Page size
 */
export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Escapes user input for safe use in MongoDB regex.
 * @param value - Raw search string
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a case-insensitive regex filter object or undefined if empty.
 * @param q - Search query
 */
export function searchRegex(q: unknown): RegExp | undefined {
  if (typeof q !== 'string' || !q.trim()) return undefined;
  return new RegExp(escapeRegex(q.trim()), 'i');
}
