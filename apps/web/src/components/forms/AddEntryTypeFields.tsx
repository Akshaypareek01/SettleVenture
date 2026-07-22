import { BankAccount, Category } from '../../lib/api';
import { formatINR } from '../../lib/format';
import type { PartnerEmiSummary } from '../../lib/api';

interface AddEntryTypeFieldsProps {
  needsBankAccount: boolean;
  needsCategory: boolean;
  needsBeneficiary: boolean;
  needsEmi: boolean;
  needsPaidTo: boolean;
  bankAccountId: string;
  setBankAccountId: (v: string) => void;
  activeAccounts: BankAccount[];
  bankBalances: Record<string, number>;
  balanceShortfall: boolean;
  selectedBalance: number | null;
  categoryId: string;
  setCategoryId: (v: string) => void;
  selectableOutCategories: Category[];
  beneficiaryPartnerId: string;
  setBeneficiaryPartnerId: (v: string) => void;
  setAmount: (v: string) => void;
  emiPartners: PartnerEmiSummary[];
  emiPeriod: string;
  setEmiPeriod: (v: string) => void;
  sourceField: { label: string; placeholder: string };
  paidFrom: string;
  setPaidFrom: (v: string) => void;
  paidTo: string;
  setPaidTo: (v: string) => void;
}

/**
 * Conditional entry fields that depend on selected transaction type.
 */
export default function AddEntryTypeFields({
  needsBankAccount,
  needsCategory,
  needsBeneficiary,
  needsEmi,
  needsPaidTo,
  bankAccountId,
  setBankAccountId,
  activeAccounts,
  bankBalances,
  balanceShortfall,
  selectedBalance,
  categoryId,
  setCategoryId,
  selectableOutCategories,
  beneficiaryPartnerId,
  setBeneficiaryPartnerId,
  setAmount,
  emiPartners,
  emiPeriod,
  setEmiPeriod,
  sourceField,
  paidFrom,
  setPaidFrom,
  paidTo,
  setPaidTo,
}: AddEntryTypeFieldsProps) {
  return (
    <>
      {needsBankAccount && (
        <div>
          <label htmlFor="bankAccountId" className="block text-sm font-medium mb-2">
            Project bank account <span className="text-red-400">*</span>
          </label>
          <select
            id="bankAccountId"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="input-field"
            required
            aria-label="Project bank account"
          >
            <option value="">Select account</option>
            {activeAccounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.label}
                {a.bankName ? ` (${a.bankName})` : ''}
                {bankBalances[a._id] !== undefined
                  ? ` — ${formatINR(bankBalances[a._id])} avail`
                  : ''}
              </option>
            ))}
          </select>
          {balanceShortfall && selectedBalance !== null && (
            <p className="text-amber-400 text-xs mt-2" role="alert">
              Amount exceeds available balance ({formatINR(selectedBalance)}).
            </p>
          )}
        </div>
      )}

      {needsCategory && (
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium mb-2">
            Outflow category <span className="text-red-400">*</span>
          </label>
          {selectableOutCategories.length === 0 ? (
            <p className="text-sm text-amber-400">No outflow categories available.</p>
          ) : (
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input-field"
              required
              aria-label="Outflow category"
            >
              <option value="">Select category</option>
              {selectableOutCategories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {needsBeneficiary && (
        <div>
          <label htmlFor="beneficiaryPartnerId" className="block text-sm font-medium mb-2">
            EMI for partner <span className="text-red-400">*</span>
          </label>
          <select
            id="beneficiaryPartnerId"
            value={beneficiaryPartnerId}
            onChange={(e) => {
              setBeneficiaryPartnerId(e.target.value);
              const row = emiPartners.find((p) => p.partnerId === e.target.value);
              if (row?.monthlyEmi) setAmount(String(row.monthlyEmi));
            }}
            className="input-field"
            required
            aria-label="Beneficiary partner"
          >
            <option value="">Select partner</option>
            {emiPartners.map((p) => (
              <option key={p.partnerId} value={p.partnerId}>
                {p.name} (EMI {formatINR(p.monthlyEmi)})
              </option>
            ))}
          </select>
        </div>
      )}

      {needsEmi && (
        <div>
          <label htmlFor="emiPeriod" className="block text-sm font-medium mb-2">
            EMI period (YYYY-MM) <span className="text-red-400">*</span>
          </label>
          <input
            id="emiPeriod"
            type="month"
            value={emiPeriod}
            onChange={(e) => setEmiPeriod(e.target.value)}
            className="input-field"
            required
            aria-label="EMI period"
          />
        </div>
      )}

      <div>
        <label htmlFor="paidFrom" className="block text-sm font-medium mb-2">
          {sourceField.label} <span className="text-red-400">*</span>
        </label>
        <input
          id="paidFrom"
          type="text"
          value={paidFrom}
          onChange={(e) => setPaidFrom(e.target.value)}
          className="input-field"
          placeholder={sourceField.placeholder}
          required
        />
      </div>

      {needsPaidTo && (
        <div>
          <label htmlFor="paidTo" className="block text-sm font-medium mb-2">
            Paid to / where it went <span className="text-red-400">*</span>
          </label>
          <input
            id="paidTo"
            type="text"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
            className="input-field"
            placeholder="Vendor, driver, pump..."
            required
          />
        </div>
      )}
    </>
  );
}
