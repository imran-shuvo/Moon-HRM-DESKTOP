# Database & backups

Moon Finance keeps all expenses, budget payments, types, departments and
receipt files in **PostgreSQL 13 or newer**. The app creates and upgrades its
own tables; you only need an empty database and a user.

## 1. Create the database (once)

Run as a PostgreSQL admin user. With Postgres.app or Homebrew on a Mac, the admin
is your Mac user name, so use `psql postgres`. On Linux or Windows installers,
use `psql -U postgres`.

```sql
CREATE ROLE moon_finance LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE moon_finance OWNER moon_finance;
```

Several computers can use the same database at the same time. Each one
refreshes its data when its window regains focus, or with **Refresh** in the
page footer.

## 2. Connect the app

On first start the app asks for the server, port, database name, user and
password. **Test connection** checks them without saving; **Save & connect**
saves them and creates the tables. The password is encrypted with the
operating system's keychain (macOS Keychain, Windows DPAPI).

To change it later, go to **Backup → Database → Change connection**.

For development you can set `DATABASE_URL` instead, for example:

```sh
DATABASE_URL=postgres://moon_finance:password@localhost:5432/moon_finance npm start
```

When `DATABASE_URL` is set it overrides the saved settings.

### Data from the previous version

The version before the database kept data inside the app on one computer. If
the app finds that data and the database is empty, it shows **Import device
data**. This copies every expense, budget payment and receipt into the
database in one transaction. The old copy is kept, not deleted, under the
browser-storage key `moon-expenses-v1-imported`.

## 3. Backups

A backup is a single `.mfbackup` file. It is gzip-compressed JSON with a
SHA-256 checksum, and it contains every record **and the receipt files**. It
does not depend on `pg_dump` or on the PostgreSQL version, so you can restore it
onto a new server.

| | |
|---|---|
| **Automatic** | While the app is open and connected, it makes a backup whenever the last one is older than the chosen interval (every day by default). That includes right after startup. The app keeps the newest 14 automatic backups. You can change both under **Backup → Backup & restore**. |
| **Manual** | **Back up now** saves to the backup folder. **Save backup as…** lets you choose the location, such as a USB drive. Manual backups are never deleted automatically. |
| **Before restore** | Made automatically just before every restore, so you can undo a restore. |

The default folder is `Documents/Moon Finance Backups`. **Point it at a synced
or network folder** (OneDrive, Google Drive, a NAS) with **Change folder**. A
backup kept only on the same computer is lost if that computer is lost.

Each backup is written to a temporary file and renamed when complete, then
read back and verified. A crash never leaves a half-written backup.

## 4. Restoring

**Backup → Restore…** on a listed backup, or **Restore from file…** for any
`.mfbackup` file:

1. The file is opened and fully checked: format, version, checksum, and that
   every expense's type, department and receipt references are consistent.
   A damaged or edited file is rejected before anything changes.
2. You see what the backup contains and must confirm.
3. A *before restore* backup of the current data is written.
4. All data is replaced **in a single transaction**. If anything fails, the
   database is left exactly as it was.

## 5. Server-level backups (recommended in addition)

App backups protect the data. Your database administrator should still use
PostgreSQL's own tools on the server, such as `pg_dump` on a schedule or a
managed provider's point-in-time recovery. Those protect against server loss
between app backups.

## For developers

- Schema changes go in `src/main/db/migrations.ts` as a **new** numbered
  migration. Never edit a migration that has shipped. Migrations run in a
  transaction behind an advisory lock, so two app instances never run them at
  the same time.
- All SQL is in `src/main/db/repository.ts` and is parameterised. The renderer
  never touches the database: it calls `window.financeApi` (see
  `src/main/preload.ts`). Every input is validated again in the main process
  by `src/shared/validation.ts`.
- Amounts are `NUMERIC(14,2)`. The total including VAT is a generated column,
  so it always equals excluding-VAT plus VAT.
- Renaming a type or department cascades to its expenses. Deleting one that is
  still in use is refused by a foreign key.
- UI tests run against `src/testFixtures/memoryApi.ts`, an in-memory
  implementation of the same API with the same validation.
