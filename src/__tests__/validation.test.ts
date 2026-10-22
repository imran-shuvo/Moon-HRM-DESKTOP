/**
 * @jest-environment node
 */
import {
  validateBudgetTransactionInput,
  validateExpenseInput,
  validateLegacyPayload,
  validateUploads,
  validateVoucherInput,
} from '../shared/validation';

const expense = {
  date: '2026-10-09',
  payee: '  Pacific Supply ',
  particulars: 'Lumber',
  category: 'Materials',
  department: '',
  paymentMethod: 'Cash',
  projectName: '',
  invoiceNo: '',
  siteName: '',
  vatNo: '',
  amountExcludingVat: 100.005,
  vat: 15,
};

describe('input validation', () => {
  it('trims text and rounds money to cents', () => {
    expect(validateExpenseInput(expense)).toEqual(
      expect.objectContaining({
        payee: 'Pacific Supply',
        amountExcludingVat: 100.01,
      }),
    );
  });

  it('rejects impossible dates, missing payees and bad amounts', () => {
    expect(() =>
      validateExpenseInput({ ...expense, date: '2026-02-30' }),
    ).toThrow(/real calendar date/);
    expect(() => validateExpenseInput({ ...expense, payee: '  ' })).toThrow(
      /Paid to is required/,
    );
    expect(() =>
      validateExpenseInput({ ...expense, amountExcludingVat: 0 }),
    ).toThrow(/greater than zero/);
    expect(() => validateExpenseInput({ ...expense, vat: Number.NaN })).toThrow(
      /must be a number/,
    );
  });

  it('only accepts Cash or Card for budget payments', () => {
    const payment = {
      date: '2026-10-01',
      amount: 500,
      paidBy: 'Owner',
      paymentMethod: 'Cheque',
      note: '',
    };
    expect(() => validateBudgetTransactionInput(payment)).toThrow(
      /Cash or Card/,
    );
    expect(
      validateBudgetTransactionInput({ ...payment, paymentMethod: 'Card' })
        .amount,
    ).toBe(500);
  });

  it('limits attachment size', () => {
    expect(() =>
      validateUploads([
        {
          name: 'big.pdf',
          type: 'application/pdf',
          data: new Uint8Array(16 * 1024 * 1024),
        },
      ]),
    ).toThrow(/larger than 15 MB/);
  });

  it('accepts older device data that lacks the newer fields', () => {
    const payload = validateLegacyPayload({
      expenses: [
        { id: 'sample-1', date: '2026-09-01', payee: 'Vendor', amount: 42 },
      ],
      budgetTransactions: [],
      categories: ['Materials'],
      departments: ['Operations'],
    });
    expect(payload.expenses[0]).toEqual(
      expect.objectContaining({
        amountIncludingVat: 42,
        amountExcludingVat: 42,
        vat: 0,
        attachmentFiles: [],
      }),
    );
  });

  it('checks a voucher and numbers its lines through every section', () => {
    const line = {
      date: '',
      particulars: ' Petrol ',
      supplier: 'Toyota Hilux',
      vatNo: '',
      invoiceNo: '',
      amountExclVat: null,
      vatAmount: null,
      amount: 136,
    };
    const voucher = {
      refNo: ' MOON/PCV/2026-001 ',
      date: '2026-10-15',
      employeeId: '11111111-1111-4111-8111-111111111111',
      receipts: [{ date: '2026-10-01', receivedFrom: ' Imran ', amount: 1000 }],
      sections: [
        { title: 'Mall', lines: [line] },
        { title: '', lines: [line, line] },
      ],
      createdBy: '',
      verifiedBy: '',
      approvedBy: '',
    };
    const checked = validateVoucherInput(voucher);
    expect(checked.refNo).toBe('MOON/PCV/2026-001');
    expect(checked.receipts[0].receivedFrom).toBe('Imran');
    expect(checked.sections[1].lines[0].particulars).toBe('Petrol');

    const withBadLine = {
      ...voucher,
      sections: [
        voucher.sections[0],
        { title: '', lines: [line, { ...line, amount: 0 }] },
      ],
    };
    expect(() => validateVoucherInput(withBadLine)).toThrow(
      'Line 3: amount must be greater than zero.',
    );
    expect(() =>
      validateVoucherInput({
        ...voucher,
        sections: [
          {
            title: '',
            lines: [{ ...line, amountExclVat: 100, vatAmount: 15 }],
          },
        ],
      }),
    ).toThrow('Line 1: the amount must be the amount excluding VAT plus VAT.');
    expect(() =>
      validateVoucherInput({
        ...voucher,
        sections: [{ title: 'Tower 2', lines: [] }],
      }),
    ).toThrow('Section “Tower 2” has no lines.');
    expect(() =>
      validateVoucherInput({
        ...voucher,
        receipts: [{ date: '2026-10-01', receivedFrom: '', amount: 10 }],
      }),
    ).toThrow('Amount received 1: received from is required.');
    expect(() => validateVoucherInput({ ...voucher, employeeId: '' })).toThrow(
      'Choose the employee.',
    );
    expect(() => validateVoucherInput({ ...voucher, refNo: ' ' })).toThrow(
      'Voucher no. is required.',
    );
  });
});
