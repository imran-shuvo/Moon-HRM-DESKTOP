import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../renderer/App';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should render', () => {
    expect(render(<App />)).toBeTruthy();
  });

  it('records an expense and saves it on this device', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    fireEvent.change(screen.getByLabelText('Paid to'), {
      target: { value: 'Test Building Supply' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Replacement materials' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '125.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));

    expect(screen.getByText('Test Building Supply')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('moon-expenses-v1') || '{}').expenses,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payee: 'Test Building Supply',
          amount: 125.5,
        }),
      ]),
    );
  });

  it('filters transactions by payee', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.change(screen.getByLabelText('Search transactions'), {
      target: { value: 'Pacific Building Supply' },
    });

    expect(
      screen.getAllByText('Pacific Building Supply').length,
    ).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('table')).queryByText('Evergreen Fuel Co.'),
    ).not.toBeInTheDocument();
  });

  it('edits a transaction from the transaction list', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const transactionRow = screen
      .getByText(/Lumber & site materials/)
      .closest('tr');
    expect(transactionRow).not.toBeNull();
    fireEvent.click(
      within(transactionRow as HTMLElement).getByRole('button', {
        name: /^Edit expense/,
      }),
    );
    fireEvent.change(screen.getByLabelText('Paid to'), {
      target: { value: 'Updated Supply Co.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      screen.getByText(/Lumber & site materials/).closest('tr'),
    ).toHaveTextContent('Updated Supply Co.');
  });

  it('adds a category for future transactions', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: 'Insurance' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    expect(
      JSON.parse(localStorage.getItem('moon-expenses-v1') || '{}').categories,
    ).toContain('Insurance');
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    expect(
      screen.getByRole('option', { name: 'Insurance' }),
    ).toBeInTheDocument();
  });

  it('filters transactions by department and month', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.change(screen.getByLabelText('Filter by department'), {
      target: { value: 'Field Services' },
    });

    const table = within(screen.getByRole('table'));
    expect(table.getByText(/Lumber & site materials/)).toBeInTheDocument();
    expect(table.queryByText('Evergreen Fuel Co.')).not.toBeInTheDocument();

    const currentMonth = JSON.parse(
      localStorage.getItem('moon-expenses-v1') || '{}',
    ).expenses[0].date.slice(0, 7);
    fireEvent.change(screen.getByLabelText('Filter by month'), {
      target: { value: currentMonth },
    });
    expect(table.getByText(/Lumber & site materials/)).toBeInTheDocument();
  });

  it('filters out transactions from other months', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    fireEvent.change(screen.getByLabelText('Paid to'), {
      target: { value: 'January Vendor' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'January purchase' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '125' },
    });
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2020-01-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    fireEvent.change(screen.getByLabelText('Filter by month'), {
      target: { value: '2020-01' },
    });

    const table = within(screen.getByRole('table'));
    expect(table.getByText('January Vendor')).toBeInTheDocument();
    expect(
      table.queryByText(/Lumber & site materials/),
    ).not.toBeInTheDocument();
  });

  it('shows the selected report period and remaining-budget column', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /reports/i }));
    fireEvent.change(screen.getByLabelText('Report period'), {
      target: { value: 'yearly' },
    });

    expect(screen.getByText('Yearly transaction log')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'REMAINING' }),
    ).toBeInTheDocument();
  });

  it('confirms before deleting a transaction', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const transactionRow = screen
      .getByText(/Lumber & site materials/)
      .closest('tr');
    expect(transactionRow).not.toBeNull();
    fireEvent.click(
      within(transactionRow as HTMLElement).getByRole('button', {
        name: /^Delete expense/,
      }),
    );

    const confirmation = screen.getByRole('alertdialog');
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Delete expense' }),
    );
    expect(
      within(screen.getByRole('table')).queryByText(/Lumber & site materials/),
    ).not.toBeInTheDocument();
  });

  it('records company payments and calculates the remaining balance', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    fireEvent.change(screen.getByLabelText('Payment amount'), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByLabelText('Received from'), {
      target: { value: 'Moon Contracting' },
    });
    fireEvent.change(screen.getByLabelText('Budget payment method'), {
      target: { value: 'Card' },
    });
    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: 'First installment' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));

    const budgetTable = within(screen.getByRole('table'));
    expect(budgetTable.getByText('$50,000.00')).toBeInTheDocument();
    expect(budgetTable.getByText('First installment')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('moon-expenses-v1') || '{}')
        .budgetTransactions,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 50000,
          paidBy: 'Moon Contracting',
          paymentMethod: 'Card',
          note: 'First installment',
        }),
      ]),
    );
  });

  it('shows budget payments in transactions and starts a fresh balance', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    fireEvent.change(screen.getByLabelText('Payment amount'), {
      target: { value: '10000' },
    });
    fireEvent.change(screen.getByLabelText('Received from'), {
      target: { value: 'Company' },
    });
    fireEvent.change(screen.getByLabelText('Budget payment method'), {
      target: { value: 'Cash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Company')).toBeInTheDocument();
    expect(table.getByText('Company payment')).toBeInTheDocument();
    expect(
      table.getAllByText('$10,000.00', { selector: 'td' }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('filters budget payments by payer, month, and payment method', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));

    function addPayment(payer: string, date: string, method: string) {
      fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
      fireEvent.change(screen.getByLabelText('Payment amount'), {
        target: { value: '2500' },
      });
      fireEvent.change(screen.getByLabelText('Received from'), {
        target: { value: payer },
      });
      fireEvent.change(screen.getByLabelText('Date received'), {
        target: { value: date },
      });
      fireEvent.change(screen.getByLabelText('Budget payment method'), {
        target: { value: method },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    }

    addPayment('Acme Ltd', '2026-01-03', 'Cash');
    addPayment('Northwind', '2026-02-03', 'Card');
    fireEvent.change(screen.getByLabelText('Filter budgets by payer'), {
      target: { value: 'Acme Ltd' },
    });
    fireEvent.change(screen.getByLabelText('Filter budgets by month'), {
      target: { value: '2026-01' },
    });
    fireEvent.change(
      screen.getByLabelText('Filter budgets by payment method'),
      {
        target: { value: 'Cash' },
      },
    );

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Acme Ltd')).toBeInTheDocument();
    expect(table.queryByText('Northwind')).not.toBeInTheDocument();
  });

  it('offers a budget export action', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    expect(
      screen.getByRole('button', { name: /export budgets/i }),
    ).toBeInTheDocument();
  });
});
