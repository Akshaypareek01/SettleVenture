import { Search } from 'lucide-react';

export interface FilterOption {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterOption[];
  onFilterChange?: (key: string, value: string) => void;
}

/**
 * Search bar and optional filter dropdowns for list views.
 */
export default function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onFilterChange,
}: ListToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input-field pl-10"
          aria-label="Search list"
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.key}
          value={f.value}
          onChange={(e) => onFilterChange?.(f.key, e.target.value)}
          className="input-field sm:w-44"
          aria-label={f.label}
        >
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
