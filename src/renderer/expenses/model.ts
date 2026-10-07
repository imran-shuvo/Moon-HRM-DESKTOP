export type Section =
  | 'Overview'
  | 'Transactions'
  | 'Budgets'
  | 'Reports'
  | 'Settings';

export type Expense = {
  id: string;
  date: string;
  payee: string;
  description: string;
  category: string;
  department: string;
  paymentMethod: string;
  amount: number;
  createdAt?: number;
};

export type Budget = {
  category: string;
  limit: number;
  color: string;
};

export type BudgetTransaction = {
  id: string;
  date: string;
  amount: number;
  paidBy?: string;
  paymentMethod?: 'Cash' | 'Card';
  note: string;
  createdAt?: number;
};

export type BudgetLedgerEntry = {
  id: string;
  date: string;
  description: string;
  kind: 'payment' | 'expense';
  amount: number;
  balance: number;
  expense?: Expense;
  payment?: BudgetTransaction;
};

export const DEFAULT_CATEGORIES = [
  'Materials',
  'Payroll',
  'Equipment',
  'Travel',
  'Other',
];
export const DEFAULT_DEPARTMENTS = [
  'Operations',
  'Field Services',
  'Administration',
  'Sales',
];
export const CATEGORIES = DEFAULT_CATEGORIES;
export const DEPARTMENTS = DEFAULT_DEPARTMENTS;
export const PAYMENT_METHODS = [
  'Company card',
  'Bank transfer',
  'Cash',
  'Petty cash',
];

export function todayKey() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

export function monthToDate(expenses: Expense[]) {
  const month = todayKey().slice(0, 7);
  return expenses.filter((expense) => expense.date.startsWith(month));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function createBudgetLedger(
  expenses: Expense[],
  payments: BudgetTransaction[],
) {
  const entries = [
    ...payments.map((payment) => ({
      id: `payment:${payment.id}`,
      date: payment.date,
      description:
        payment.note || `Payment from ${payment.paidBy || 'company'}`,
      kind: 'payment' as const,
      amount: payment.amount,
      expense: undefined,
      payment,
    })),
    ...expenses.map((expense) => ({
      id: `expense:${expense.id}`,
      date: expense.date,
      description: expense.payee,
      kind: 'expense' as const,
      amount: expense.amount,
      expense,
      payment: undefined,
    })),
  ].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    const aCreatedAt = a.expense?.createdAt ?? a.payment?.createdAt;
    const bCreatedAt = b.expense?.createdAt ?? b.payment?.createdAt;
    if (aCreatedAt !== undefined || bCreatedAt !== undefined) {
      if (aCreatedAt === undefined) return -1;
      if (bCreatedAt === undefined) return 1;
      if (aCreatedAt !== bCreatedAt) return aCreatedAt - bCreatedAt;
    }
    if (a.kind !== b.kind) return a.kind === 'payment' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  let balance = 0;
  return entries.map((entry) => {
    if (entry.kind === 'payment') {
      balance = entry.amount;
    } else {
      balance -= entry.amount;
    }
    return { ...entry, balance };
  });
}

export function createSampleExpenses(): Expense[] {
  const today = new Date();
  const date = (daysAgo: number) => {
    const sampleDate = new Date(today);
    sampleDate.setDate(today.getDate() - daysAgo);
    return new Date(
      sampleDate.getTime() - sampleDate.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);
  };
  return [
    {
      id: 'sample-1',
      date: date(0),
      payee: 'Pacific Building Supply',
      description: 'Lumber & site materials',
      category: 'Materials',
      department: 'Field Services',
      paymentMethod: 'Company card',
      amount: 2840,
    },
    {
      id: 'sample-2',
      date: date(0),
      payee: 'Evergreen Fuel Co.',
      description: 'Fleet fuel — weekly fill-up',
      category: 'Travel',
      department: 'Operations',
      paymentMethod: 'Company card',
      amount: 685,
    },
    {
      id: 'sample-3',
      date: date(1),
      payee: 'Northstar Equipment',
      description: 'Excavator rental · 3 days',
      category: 'Equipment',
      department: 'Field Services',
      paymentMethod: 'Bank transfer',
      amount: 1850,
    },
    {
      id: 'sample-4',
      date: date(1),
      payee: 'City Permit Office',
      description: 'Building permit · Unit 12',
      category: 'Other',
      department: 'Administration',
      paymentMethod: 'Company card',
      amount: 425,
    },
    {
      id: 'sample-5',
      date: date(2),
      payee: 'Brightline Electric',
      description: 'Electrical supplies',
      category: 'Materials',
      department: 'Field Services',
      paymentMethod: 'Bank transfer',
      amount: 1275,
    },
    {
      id: 'sample-6',
      date: date(3),
      payee: 'Metro Payroll Services',
      description: 'Weekly payroll processing',
      category: 'Payroll',
      department: 'Administration',
      paymentMethod: 'Bank transfer',
      amount: 6200,
    },
    {
      id: 'sample-7',
      date: date(4),
      payee: 'Oak & Stone Hardware',
      description: 'Job site tools & safety gear',
      category: 'Equipment',
      department: 'Field Services',
      paymentMethod: 'Company card',
      amount: 960,
    },
    {
      id: 'sample-8',
      date: date(5),
      payee: 'Citywide Waste Removal',
      description: 'Job site debris collection',
      category: 'Other',
      department: 'Operations',
      paymentMethod: 'Bank transfer',
      amount: 540,
    },
    {
      id: 'sample-9',
      date: date(6),
      payee: 'Roadway Tolls',
      description: 'Fleet tolls · September',
      category: 'Travel',
      department: 'Operations',
      paymentMethod: 'Company card',
      amount: 320,
    },
    {
      id: 'sample-10',
      date: date(8),
      payee: 'Summit Lumber Co.',
      description: 'Framing package · Lot 28',
      category: 'Materials',
      department: 'Field Services',
      paymentMethod: 'Bank transfer',
      amount: 4320,
    },
    {
      id: 'sample-11',
      date: date(10),
      payee: 'Metro Payroll Services',
      description: 'Weekly payroll processing',
      category: 'Payroll',
      department: 'Administration',
      paymentMethod: 'Bank transfer',
      amount: 6200,
    },
    {
      id: 'sample-12',
      date: date(12),
      payee: 'WorkSafe Outfitters',
      description: 'Protective clothing & PPE',
      category: 'Equipment',
      department: 'Field Services',
      paymentMethod: 'Company card',
      amount: 1180,
    },
    {
      id: 'sample-13',
      date: date(14),
      payee: 'Evergreen Fuel Co.',
      description: 'Fleet fuel',
      category: 'Travel',
      department: 'Operations',
      paymentMethod: 'Company card',
      amount: 740,
    },
    {
      id: 'sample-14',
      date: date(17),
      payee: 'Pacific Building Supply',
      description: 'Concrete & aggregates',
      category: 'Materials',
      department: 'Field Services',
      paymentMethod: 'Bank transfer',
      amount: 3650,
    },
    {
      id: 'sample-15',
      date: date(20),
      payee: 'Metro Payroll Services',
      description: 'Weekly payroll processing',
      category: 'Payroll',
      department: 'Administration',
      paymentMethod: 'Bank transfer',
      amount: 6200,
    },
  ];
}
