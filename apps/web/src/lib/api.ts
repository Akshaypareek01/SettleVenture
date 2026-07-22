const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/**
 * Redirects to login on session expiry (skips auth bootstrap paths).
 * @param path - Requested API path
 * @param status - HTTP status from response
 */
function handleUnauthorized(path: string, status: number): void {
  if (status !== 401) return;
  if (path.startsWith('/auth/')) return;
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  window.location.assign('/login');
}

/**
 * Typed fetch wrapper with credentials for cookie auth.
 * @param path - API path starting with /
 * @param options - Fetch options
 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    handleUnauthorized(path, res.status);
    throw new ApiError(data.error || 'Request failed', res.status);
  }

  return data as T;
}

/**
 * Uploads a file via multipart form data.
 * @param path - API path
 * @param formData - FormData with file fields
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(path, res.status);
    throw new ApiError(data.error || 'Upload failed', res.status);
  }
  return data as T;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'partner' | 'admin';
  totalInvested?: number;
}

export interface VentureType {
  _id: string;
  slug: string;
  label: string;
  icon: string;
  colorHex: string;
  isActive?: boolean;
}

export interface BankAccount {
  _id: string;
  label: string;
  bankName?: string;
  accountHint?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Venture {
  _id: string;
  name: string;
  description?: string;
  status: string;
  ventureTypeId: VentureType | string;
  bankAccounts?: BankAccount[];
}

export interface Category {
  _id: string;
  name: string;
  direction: 'IN' | 'OUT';
  systemKey?: string;
  isActive: boolean;
  ventureId?: string | null;
}

export interface Transaction {
  _id: string;
  type?:
    | 'CONTRIBUTION_IN'
    | 'EXPENSE'
    | 'VENDOR_PAYMENT_OUT'
    | 'EARNING_IN'
    | 'EMI_PERSONAL'
    | 'EMI_FROM_BANK';
  amount: number;
  date: string;
  paidFrom?: string;
  paidTo?: string;
  remark?: string;
  bankAccountId?: string;
  bankAccountLabel?: string;
  categoryId?: string;
  categoryName?: string;
  beneficiaryPartnerId?: string | { _id: string; name: string; email: string };
  emiPeriod?: string;
  partnerId: { _id: string; name: string; email: string };
  attachments?: { id: string; fileName: string; fileType?: string; downloadUrl: string }[];
}

export interface PartnerSummaryRow {
  partnerId: string;
  name: string;
  depositedToPool: number;
  directExpenses: number;
  earningsTotal?: number;
  totalContributed: number;
  pctOfTotal: number;
  isAssigned?: boolean;
}

export interface BankAccountSummary {
  accountId: string;
  label: string;
  totalIn: number;
  totalOut: number;
  balance: number;
}

export interface PartnerEmiSummary {
  partnerId: string;
  name: string;
  isEmiActive: boolean;
  loanAmount: number;
  monthlyEmi: number;
  emiStartDate: string | null;
  tenureMonths: number | null;
  paidAmount: number;
  remaining: number;
  monthsDue: number;
  monthsWithPayment: number;
  overduePeriods: string[];
  personalPaid: number;
  bankPaid: number;
}

export interface VentureEmiSummary {
  partners: PartnerEmiSummary[];
  totalLoan: number;
  totalPaid: number;
  totalRemaining: number;
  totalPersonalPaid: number;
  totalBankPaid: number;
}

export interface VentureSummary {
  poolInTotal: number;
  poolOutTotal: number;
  poolBalance: number;
  totalContributed: number;
  earningsTotal?: number;
  byPartner: PartnerSummaryRow[];
  byBankAccount: BankAccountSummary[];
  emiSummary?: VentureEmiSummary;
  settlement: {
    partnerId: string;
    name: string;
    contributed: number;
    fairShare: number;
    netBalance: number;
    status: string;
  }[];
}

export interface DocumentFile {
  id: string;
  fileName: string;
  fileType: string;
  downloadUrl: string;
  uploadedBy: { name: string };
  uploadedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface CompanySnapshot {
  firmName: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountHint?: string;
  ifsc?: string;
}

export interface Invoice {
  _id: string;
  ventureId: string;
  number?: string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  issueDate?: string;
  dueDate?: string;
  lineItems: InvoiceLineItem[];
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  isInterState: boolean;
  totalAmount: number;
  notes?: string;
  companySnapshot?: CompanySnapshot;
  linkedEarningTransactionId?: string;
  linkedBankAccountId?: string;
  linkedBankAccountLabel?: string;
  createdAt?: string;
}

export interface GstMonthRow {
  period: string;
  invoiceCount: number;
  taxableAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

export interface GstSummary {
  from: string | null;
  to: string | null;
  byMonth: GstMonthRow[];
  totals: Omit<GstMonthRow, 'period'>;
}
