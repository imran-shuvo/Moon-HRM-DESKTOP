import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import App from '../renderer/App';
import createMemoryApi from '../testFixtures/memoryApi';
import { Employee, PettyCashVoucher } from '../shared/types';

const KEPAYAT = '11111111-1111-4111-8111-111111111111';
const SHAKIL = '22222222-2222-4222-8222-222222222222';

function employee(overrides: Partial<Employee>): Employee {
  return {
    id: KEPAYAT,
    name: 'Kepayat',
    nickname: '',
    role: 'company_worker',
    iqamaNo: '2400000001',
    designation: 'Foreman',
    projectName: 'Mall',
    phoneNo: '',
    insuranceNo: '',
    salary: 2600,
    iqamaExpiry: '',
    campName: '',
    workHoursPerDay: 10,
    hourlyRate: null,
    terminationDate: '',
    ...overrides,
  };
}

const VOUCHER: PettyCashVoucher = {
  id: '33333333-3333-4333-8333-333333333333',
  refNo: 'MOON/PCV/2026-001',
  date: '2026-10-15',
  employeeId: KEPAYAT,
  receipts: [{ date: '2026-10-01', receivedFrom: 'Imran', amount: 4200 }],
  sections: [
    {
      title: 'Riyadh Avenue Mall',
      lines: [
        {
          date: '2026-10-10',
          particulars: 'Kawsar Ahmed',
          supplier: 'Carpenter (advance) mall',
          vatNo: '',
          invoiceNo: '',
          amountExclVat: null,
          vatAmount: null,
          amount: 300,
        },
      ],
    },
  ],
  createdBy: 'Kepayat',
  verifiedBy: '',
  approvedBy: '',
  createdAt: 1,
};

/** Vouchers has its own section in the sidebar, with its pages under it. */
function nav(name: string | RegExp) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).getByRole('button', { name }),
  );
}

async function renderVouchers(vouchers: PettyCashVoucher[] = []) {
  const memory = createMemoryApi({
    expenses: [],
    employees: [
      employee({}),
      employee({ id: SHAKIL, name: 'Md Shakil Miah', iqamaNo: '2400000002' }),
    ],
    pettyCashVouchers: vouchers,
  });
  render(<App api={memory.api} />);
  await screen.findByRole('navigation', { name: 'Main navigation' });
  nav('Vouchers');
  return memory;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

// The form has one Save voucher button, at the end.
const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save voucher' }));

describe('Petty cash vouchers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is its own section with a voucher list and a create page', async () => {
    await renderVouchers();
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(
      within(sidebar).getByRole('button', { name: /^.*Vouchers$/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(sidebar).getByRole('button', { name: 'Voucher list' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', { name: 'Create voucher' }),
    ).toBeInTheDocument();
    // Petty cash's own pages are not listed while Vouchers is open.
    expect(
      within(sidebar).queryByRole('button', { name: 'Cash in hand' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Voucher list',
    );

    nav('Create voucher');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Create voucher',
    );
    expect(
      screen.getByRole('form', { name: 'New voucher' }),
    ).toBeInTheDocument();
  });

  it('creates a voucher, shows and prints it, edits and deletes it', async () => {
    const memory = await renderVouchers();
    expect(screen.getByText(/No vouchers yet/)).toBeInTheDocument();
    // The list has no received / spent / balance overview.
    expect(screen.queryByLabelText('Voucher totals')).not.toBeInTheDocument();

    nav('Create voucher');
    // Voucher details are only the voucher no., employee and date.
    expect(screen.getByLabelText('Voucher no.')).toHaveValue(
      `MOON/PCV/${new Date().getFullYear()}-001`,
    );
    expect(screen.queryByLabelText(/Project/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Department/)).not.toBeInTheDocument();
    type('Voucher no.', 'MOON/PCV/2026 - KEPAYAT');
    type('Name of employee', KEPAYAT);
    type('Date', '2026-10-15');

    // Several amounts received, each with its date and sender.
    type('Amount received 1 date', '2026-10-01');
    type('Amount received 1 received from', 'Imran');
    type('Amount received 1 amount', '1500');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add amount received' }),
    );
    type('Amount received 2 date', '2026-10-08');
    type('Amount received 2 received from', 'Head office');
    type('Amount received 2 amount', '500');
    expect(document.querySelector('.voucher-card-total')).toHaveTextContent(
      'Total received SAR 2,000.00',
    );

    type('Section 1 title', 'Riyadh Avenue Mall');
    type('Section 1 line 1 inv date', '2026-10-10');
    type('Section 1 line 1 particulars', 'Kawsar Ahmed');
    type("Section 1 line 1 supplier's name", 'Carpenter (advance) mall');
    type('Section 1 line 1 amount incl. vat', '300');
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Section 1' })).getByRole(
        'button',
        { name: '+ Add line' },
      ),
    );
    type('Section 1 line 2 particulars', 'Materials shop');
    type('Section 1 line 2 excl. vat', '100');
    type('Section 1 line 2 vat', '15');
    expect(
      screen.getByLabelText('Section 1 line 2 amount incl. vat'),
    ).toHaveValue(115);
    fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    type('Section 2 title', 'Materials & other expenses');
    type('Section 2 line 1 particulars', 'Hotel bill');
    type('Section 2 line 1 amount incl. vat', '750');

    type('Created by', 'Kepayat');
    type('Verified by', 'Md Zohir Uddin');
    type('Approved by', 'Gobi Krishnan');
    expect(
      screen.getByRole('status', { name: 'Voucher totals' }),
    ).toHaveTextContent(
      /Received SAR 2,000\.00.*Spent SAR 1,165\.00.*Balance SAR 835\.00/,
    );

    save();
    expect(
      await screen.findByText('Voucher MOON/PCV/2026 - KEPAYAT created.'),
    ).toBeInTheDocument();
    // Saving opens the voucher on the voucher list page.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Voucher list' }),
    ).toBeInTheDocument();

    const [saved] = memory.snapshot().pettyCashVouchers;
    expect(saved).toEqual(
      expect.objectContaining({
        refNo: 'MOON/PCV/2026 - KEPAYAT',
        employeeId: KEPAYAT,
        receipts: [
          { date: '2026-10-01', receivedFrom: 'Imran', amount: 1500 },
          { date: '2026-10-08', receivedFrom: 'Head office', amount: 500 },
        ],
        approvedBy: 'Gobi Krishnan',
      }),
    );
    expect(saved.sections[0].lines[1]).toEqual(
      expect.objectContaining({
        amountExclVat: 100,
        vatAmount: 15,
        amount: 115,
      }),
    );

    // The voucher has the company report header and the employee's details.
    const sheet = screen.getByRole('document', {
      name: 'Voucher MOON/PCV/2026 - KEPAYAT',
    });
    expect(sheet).toHaveTextContent('MOON TRADING CONTRACTING & CLEANING');
    expect(sheet).toHaveTextContent('PETTY CASH VOUCHER');
    const details = within(
      sheet.querySelector('.voucher-details') as HTMLElement,
    ).getAllByRole('row');
    expect(details[1]).toHaveTextContent('MOON/PCV/2026 - KEPAYAT');
    expect(details[1]).toHaveTextContent('Kepayat · Iqama no. 2400000001');
    expect(details[1]).toHaveTextContent('15-Oct-2026');

    const received = within(
      sheet.querySelector('.voucher-receipts') as HTMLElement,
    ).getAllByRole('row');
    expect(received[1]).toHaveTextContent('01-Oct-2026');
    expect(received[1]).toHaveTextContent('Imran');
    expect(received[2]).toHaveTextContent('Head office');
    expect(received[3]).toHaveTextContent('TOTAL RECEIVED2,000.00');

    const bills = within(
      sheet.querySelector('.voucher-table') as HTMLElement,
    ).getAllByRole('row');
    expect(bills[1]).toHaveTextContent('SECTION 1');
    expect(bills[1]).toHaveTextContent('Riyadh Avenue Mall');
    expect(bills[1]).toHaveTextContent('2 lines');
    expect(bills[2]).toHaveTextContent('10-Oct-2026');
    expect(bills[3]).toHaveTextContent('115.00');
    expect(bills[4]).toHaveTextContent('Subtotal · Riyadh Avenue Mall');
    expect(bills[4]).toHaveTextContent('415.00');
    expect(bills[5]).toHaveTextContent('SECTION 2');
    expect(bills[6]).toHaveTextContent('3');
    expect(bills[6]).toHaveTextContent('750.00');
    expect(bills[bills.length - 1]).toHaveTextContent('TOTAL SPENT · 3 LINES');
    expect(sheet.querySelector('.voucher-summary')).toHaveTextContent(
      'Balance with Kepayat835.00',
    );
    expect(sheet).toHaveTextContent('Approved byGobi Krishnan');

    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview' }));
    const preview = screen.getByRole('dialog', { name: 'Voucher preview' });
    expect(preview).toHaveTextContent('PETTY CASH VOUCHER');
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(
      within(preview).getByRole('button', { name: 'Save as PDF' }),
    );
    await waitFor(() =>
      expect(savePdf).toHaveBeenCalledWith(
        expect.stringMatching(/^petty-cash-voucher_moon-pcv-2026-kepayat_/),
        { landscape: true },
      ),
    );

    // The list shows it with its employee; clicking the row opens it.
    fireEvent.click(screen.getByRole('button', { name: '← Voucher list' }));
    const listRow = screen
      .getByRole('button', { name: 'MOON/PCV/2026 - KEPAYAT' })
      .closest('tr') as HTMLElement;
    expect(listRow).toHaveTextContent('Kepayat');
    expect(listRow).toHaveTextContent('2,000.00');
    expect(listRow).toHaveTextContent('835.00');
    expect(listRow).toHaveTextContent('Approved · Gobi Krishnan');
    fireEvent.click(listRow.querySelector('td') as HTMLElement);
    expect(
      screen.getByRole('document', { name: 'Voucher MOON/PCV/2026 - KEPAYAT' }),
    ).toBeInTheDocument();

    // Editing: remove an amount received and a line.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove amount received 2' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove section 1 line 2' }),
    );
    save();
    expect(
      await screen.findByText('Voucher MOON/PCV/2026 - KEPAYAT updated.'),
    ).toBeInTheDocument();
    const edited = memory.snapshot().pettyCashVouchers[0];
    expect(edited.receipts).toHaveLength(1);
    expect(edited.sections[0].lines).toHaveLength(1);

    // An employee with a voucher cannot be deleted.
    await expect(memory.api.employees.remove(KEPAYAT)).rejects.toThrow(
      /petty cash on record/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete voucher' }));
    expect(
      await screen.findByText('Voucher MOON/PCV/2026 - KEPAYAT deleted.'),
    ).toBeInTheDocument();
    expect(memory.snapshot().pettyCashVouchers).toHaveLength(0);
  });

  it('explains what is missing and skips empty rows', async () => {
    const memory = await renderVouchers();
    nav('Create voucher');
    type('Section 1 line 1 particulars', 'Petrol');
    type('Section 1 line 1 amount incl. vat', '136');

    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose the employee.',
    );

    type('Name of employee', SHAKIL);
    type('Amount received 1 received from', 'Imran');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Amount received 1: amount must be a number.',
    );

    // Blank rows left at the end are not saved.
    type('Amount received 1 amount', '500');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add amount received' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }));
    save();
    await screen.findByText(/created\./);
    const [saved] = memory.snapshot().pettyCashVouchers;
    expect(saved.receipts).toHaveLength(1);
    expect(saved.sections[0].lines).toHaveLength(1);
  });

  it('filters the list by employee and prints it', async () => {
    const memory = await renderVouchers([
      VOUCHER,
      {
        ...VOUCHER,
        id: '44444444-4444-4444-8444-444444444444',
        refNo: 'MOON/PCV/2026-002',
        employeeId: SHAKIL,
        date: '2026-09-02',
        createdAt: 2,
      },
    ]);
    expect(screen.getAllByRole('row').slice(1, -1)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Search vouchers'), {
      target: { value: 'shakil' },
    });
    const rows = screen.getAllByRole('row').slice(1, -1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('MOON/PCV/2026-002');
    expect(rows[0]).toHaveTextContent('Md Shakil Miah');

    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview list' }));
    const preview = screen.getByRole('dialog', { name: 'Voucher preview' });
    expect(preview).toHaveTextContent('PETTY CASH VOUCHERS');
    expect(preview).toHaveTextContent('Search: “shakil”');
    expect(preview).toHaveTextContent('Md Shakil Miah');
    expect(preview).not.toHaveTextContent('MOON/PCV/2026-001');
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(
      within(preview).getByRole('button', { name: 'Save as PDF' }),
    );
    await waitFor(() =>
      expect(savePdf).toHaveBeenCalledWith(
        expect.stringMatching(/^petty-cash-vouchers_/),
        { landscape: true },
      ),
    );
  });
});
