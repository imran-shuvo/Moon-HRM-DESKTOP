# Moon Finance

Desktop finance app for **Moon Trading Contracting & Cleaning**. It records
company expenses with VAT and receipt files, tracks budget payments received,
and produces PDF reports. All data is kept in a shared PostgreSQL database, so
several computers can work on the same books.

Built with Electron, React and TypeScript.

## Features

- **Overview**: the selected month's budget, expenses and remaining balance,
  with a spending chart, a spend-by-category breakdown and monthly totals.
- **Transactions**: add, edit and delete expenses with invoice details, VAT
  and attached receipts. Filter by date range, payee or text search.
- **Budgets**: record budget payments received (cash or card), with filters.
- **Reports**: daily, weekly, monthly and yearly reports. Expense, budget and
  combined finance reports export as A4 PDFs.
- **Month closing**: each month becomes read-only when it ends, and its
  remaining budget is carried into the next month. A closed month can be
  reopened for corrections in Settings.
- **Employees**: name, Iqama no., designation, project, phone, insurance
  no., Iqama expiry and camp. The list shows name, designation, project and
  Iqama expiry, marks in red any Iqama expiring within 30 days, and filters
  by designation, project and camp. An expense's "Paid to" and a budget's
  payee are chosen from employees.
- **Attendance** (company, outsource and camp workers; staff have none),
  in three views:
  - *Daily register*: one click per employee for Present, Absent, Leave,
    Vacation or Holiday, hours with overtime shown as you type, a note, and
    "mark everyone not recorded as …" for a whole project or camp.
  - *Monthly sheet*: every day colour-coded, with totals per status, hours
    and overtime. Grouped by project, camp or role.
  - *Employee report*: one person's month as a calendar.

  Friday is the weekly holiday. The sheet and employee reports export as
  colour-coded PDFs with a legend.
- **Payroll**, one month at a time:
  - *Payslips*: net, paid and unpaid totals; **Create payslips** for
    everyone or one project, camp or role; click a name to read, edit, pay or
    print a payslip; mark many as paid at once; print payslips or the payroll
    sheet.
  - *Advances*: give one to an employee or a whole project, camp, role or
    everyone, and see what is still owed.
  - *Payroll settings* (⚙): overtime rate, fines, and whether leave and
    vacation are paid.

  Pay rules:
  - Company and camp workers: basic salary, less a day's pay for each absent
    day (and each leave or vacation day if it is unpaid). Hours beyond their
    basic hours a day, and all Friday hours, are overtime at 20 × 1.5 an hour.
    Absent days beyond the first are fined 20.
  - Outsource workers: hours worked × rate per hour.
  - Staff: basic salary.
  - Advances are deducted from the next payslip up to its pay; the rest
    carries forward.

  Every amount on a payslip can be edited. Paid payslips are locked until
  marked unpaid. Payslips and the payroll sheet export as PDFs. An employee
  with attendance, advances or payslips cannot be deleted, so payroll
  history is never lost. Amounts are in SAR.
- **Types and departments**: chosen from dropdowns when adding an expense;
  a new one can be typed there and is saved for next time.
- **Backup & restore**: automatic and manual backups to a single
  `.mfbackup` file that includes receipts. Every restore saves a safety
  backup first.

## Requirements

- Node.js 18 or newer, with npm 7 or newer
- PostgreSQL 13 or newer, with an empty database and a user for the app

See [docs/database-and-backups.md](docs/database-and-backups.md) to create the
database, connect the app, and understand backups and restores.

## Getting started

```bash
git clone https://github.com/imran-shuvo/Moon-HRM-DESKTOP.git
cd Moon-HRM-DESKTOP
npm install
npm start
```

On first start the app asks for the database connection. It creates its own
tables. To skip that screen during development, set `DATABASE_URL`:

```bash
DATABASE_URL=postgres://moon_finance:password@localhost:5432/moon_finance npm start
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app in development mode with hot reload. |
| `npm test` | Runs the Jest test suite. |
| `npm run lint` | Lints the project with ESLint. |
| `npm run package` | Builds installers for the current platform into `release/build`. |

## Project structure

```
src/
  main/            Electron main process
    db/            PostgreSQL connection, migrations, and all SQL (repository.ts)
    backup/        Backup file format, backup scheduling and restore
    ipc.ts         IPC handlers; every input is validated here
    preload.ts     Exposes window.financeApi to the renderer
  renderer/        React UI
    App.tsx        App shell, data loading and state
    expenses/      Screens, dialogs, printable reports, calculations (model.ts)
  shared/          Types, validation and month-closing rules used by both sides
  testFixtures/    In-memory API and sample data for tests
  __tests__/       Jest tests
docs/              Database, backup and developer notes
```

The renderer never talks to the database directly. It calls
`window.financeApi`, and the main process validates the input again before
running parameterised SQL. Schema changes go in a **new** migration in
`src/main/db/migrations.ts`; never edit a migration that has shipped.

## Testing

```bash
npm test
```

UI tests render the app against `src/testFixtures/memoryApi.ts`, an in-memory
version of the database API with the same validation rules. They do not need
PostgreSQL.

## Packaging

```bash
npm run package
```

Installers are written to `release/build`: a DMG on macOS, an NSIS installer
on Windows, and an AppImage on Linux. The installed app is named
**Inventory**, as set by `build.productName` in `package.json`.

## Acknowledgements

Based on [Electron React Boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate)
(MIT license).
