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

  Pay rules (defaults, all editable in Payroll settings):
  - Company and camp workers: monthly basic salary. Per-hour salary =
    basic ÷ 30 ÷ basic hours (10 for most, 8 for a few). Overtime on a
    working day (hours beyond the basic hours) pays per-hour salary × 1.25;
    every hour on a Friday pays × 1.50. Absent and leave days count
    together: one a month is paid, and each day after that is unpaid leave,
    deducted a day's salary (basic ÷ 30). Vacation and holidays are paid.
  - Outsource workers: hours worked × rate per hour.
  - Staff: basic salary.
  - A terminated employee is paid up to their last working day (salary ×
    working days employed ÷ working days in the month) and gets no payslip
    after that month.
  - Advances are deducted from the next payslip up to its pay; the rest
    carries forward.

  **Settings → Terms & policy** explains all of these rules in plain
  language, always using the current payroll settings, and prints as a PDF.

  Every amount on a payslip can be edited. Paid payslips are locked until
  marked unpaid. Payslips and the payroll sheet export as PDFs. An employee
  with attendance, advances or payslips cannot be deleted, so payroll
  history is never lost. Amounts are in SAR.
- **Documents**: upload signature sheets, timesheets, contracts and other
  files, many at once. Each is filed by day, category, project and camp,
  shown in a folder per project, and can be opened or saved as a copy. The
  daily attendance register shows that day's signature sheets and uploads
  new ones.
- **Petty cash**: record cash given to a worker and amounts they settle
  with you, each with a date, a description, remarks and reference documents
  (receipts, vouchers). It is kept by month, in three pages listed under
  Petty Cash in the sidebar: **Petty cash given** lists the cash handed out
  (with the Give cash form), **Settlements** the amounts settled with their
  vouchers (with the Record settlement form), and **Cash in hand** what each
  worker carried in from last month, was given, settled and still holds;
  its report can also be printed as **In hand only**, just each worker's
  name and amount. What a worker holds when a month ends is
  carried into the next, and a closed month's entries are read-only like
  the rest of the books. Each section can be filtered, previewed and saved
  as a PDF; **Statement** prints one worker's month. A worker with petty
  cash on record cannot be deleted.
- **Vouchers**: its own section, with a **Voucher list** and a **Create
  voucher** page. A voucher has a voucher no., the employee and a date;
  each amount the employee received (date, from whom, amount) with their
  total; then each bill in titled sections (date, particulars, supplier,
  VAT no., invoice no., amounts excluding and including VAT) with a
  subtotal per section; the balance left; and who created, verified and
  approved it. Open a voucher from the list to see it, print it as an A4
  landscape PDF, edit or delete it. An employee with vouchers cannot be
  deleted.
- **Types and departments**: chosen from dropdowns when adding an expense;
  a new one can be typed there and is saved for next time.
- **Backup & restore**: automatic and manual backups to a single
  `.mfbackup` file that includes receipts. Every restore saves a safety
  backup first.

## Requirements

- **Node.js 18 or newer** (with npm), to run and build the app from source
- **PostgreSQL 13 or newer**, where the data is kept
- Git

The app runs on macOS, Windows and Linux.

## Install

### 1. Install Node.js and PostgreSQL

| | Node.js | PostgreSQL |
| --- | --- | --- |
| **macOS** | Installer from [nodejs.org](https://nodejs.org), or `brew install node` | [Postgres.app](https://postgresapp.com) (easiest), or `brew install postgresql@16` |
| **Windows** | Installer from [nodejs.org](https://nodejs.org) | Installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) |
| **Linux** | Your package manager, or [nodejs.org](https://nodejs.org) | `sudo apt install postgresql` (Debian/Ubuntu) or your distribution's package |

Check the versions:

```bash
node -v      # v18 or newer
psql --version
```

### 2. Create the database

Open `psql` as the PostgreSQL admin user. With Postgres.app or Homebrew that
is `psql postgres`; on Windows and Linux it is usually `psql -U postgres`
(Linux: `sudo -u postgres psql`). Then run:

```sql
CREATE ROLE moon_finance LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE moon_finance OWNER moon_finance;
```

The app creates and upgrades its own tables. Several computers can share
the same database. See
[docs/database-and-backups.md](docs/database-and-backups.md) for details.

### 3. Get the code and install dependencies

```bash
git clone https://github.com/imran-shuvo/Moon-HRM-DESKTOP.git
cd Moon-HRM-DESKTOP
npm install
```

## Run

```bash
npm start
```

On first start the app asks for the database connection: host
(`localhost`), port (`5432`), database (`moon_finance`), user
(`moon_finance`) and password. **Test connection** checks them; **Save &
connect** saves them (the password is encrypted with the system keychain)
and creates the tables. To change it later: **Backup → Database → Change
connection**.

During development you can skip that screen with `DATABASE_URL`:

```bash
DATABASE_URL=postgres://moon_finance:password@localhost:5432/moon_finance npm start
```

## Try the demo company

[`demo/moon-finance-demo.mfbackup`](demo/moon-finance-demo.mfbackup) is a
ready-made company for trying the app: 12 employees in every role across
the Mall, Tower and Office projects, September 2026 attendance (overtime,
absences, leave, vacation, a holiday and a terminated employee), salary
advances, payslips, signature sheets and other documents, and expenses and
budgets from August to October 2026 with receipts.

Load it into a **separate, empty database** so it never mixes with real
data:

```sql
CREATE DATABASE moon_finance_demo OWNER moon_finance;
```

**From the command line** (creates the tables and loads the demo; it
refuses a database that already has data):

```bash
DATABASE_URL=postgres://moon_finance:password@localhost:5432/moon_finance_demo npm run demo:load
```

Then start the app and connect to the database `moon_finance_demo`.

**Or in the app:** connect to `moon_finance_demo`, open **Backup → Restore
from file…**, choose `demo/moon-finance-demo.mfbackup` and confirm.
A restore replaces everything in the connected database, so only do this in
the demo database.

While using the demo, turn off automatic backups (**Backup → Backup &
restore**), or point them at another folder, so demo backups do not push
real ones out of the backup folder. Switch back to `moon_finance` with
**Backup → Database → Change connection**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app in development mode with hot reload. |
| `npm test` | Runs the Jest test suite. |
| `npm run lint` | Lints the project with ESLint (`npm run lint:fix` fixes formatting). |
| `npm run demo:load` | Loads the demo company into the empty database in `DATABASE_URL`. |
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
npm run lint
```

UI tests render the app against `src/testFixtures/memoryApi.ts`, an in-memory
version of the database API with the same validation rules. They do not need
PostgreSQL.

## Packaging

Build the installers on the operating system you are building for:

```bash
npm run package
```

| Built on | Output in `release/build` |
| --- | --- |
| macOS | `.dmg` installers and `.zip` archives for Apple silicon (arm64) and Intel (x64) |
| Windows | NSIS `Setup .exe` installer |
| Linux | `.AppImage` |

- The installed app is named **Moon Finance** (`build.productName` in
  `package.json`). Its version comes from `version` in
  `release/app/package.json`; raise it before building a new release.
- Builds before version 4.7.0 were called **Inventory**. Moon Finance
  installs as a separate app: uninstall Inventory afterwards. On first start
  it copies Inventory's connection and backup settings; on macOS you may be
  asked for the database password once.
- The installed app connects to PostgreSQL the same way as in development:
  on first start it asks for the server, database, user and password.
  PostgreSQL is not bundled, so every computer needs network access to the
  database server.
- Builds are not code-signed unless you provide signing certificates
  (`CSC_LINK` and `CSC_KEY_PASSWORD` for electron-builder; Apple ID details
  for macOS notarization). Unsigned apps show a warning the first time:
  - **macOS**: right-click the app → **Open**, or **System Settings →
    Privacy & Security → Open Anyway**. Without a certificate the app is
    signed ad hoc (`.erb/scripts/adhoc-sign.js`), so Apple silicon Macs
    don't report it as damaged.
  - **Windows**: on the SmartScreen prompt, **More info → Run anyway**.
- `.github/workflows/publish.yml` can build and publish installers for all
  three platforms to GitHub Releases. It is switched off; to use it, remove
  the `if:` line in that file and add the signing secrets to the repository.

## Acknowledgements

Based on [Electron React Boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate)
(MIT license).
