import { useMemo, useState } from 'react';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  DocumentRecord,
  Employee,
  distinctValues,
  formatFileSize,
  formatReportDate,
  inDateRange,
  matchesAny,
  plural,
  selfLabels,
} from '../model';
import { weekday } from './AttendancePrintableReport';
import ConfirmDialog from './ConfirmDialog';
import DocumentDialog, { DocumentDefaults } from './DocumentDialog';
import FilterBar, {
  DateRangeFilter,
  dateChip,
  multiChips,
  searchChip,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';

/** The folder for documents without a project. */
const NO_PROJECT = '\u0000none';
const ALL = '';

type Filters = {
  folder: string;
  search: string;
  from: string;
  to: string;
  categories: string[];
  camps: string[];
};

const NO_FILTERS: Filters = {
  folder: ALL,
  search: '',
  from: '',
  to: '',
  categories: [],
  camps: [],
};

/** A short label for the kind of file. */
export function fileKind(
  document: Pick<DocumentRecord, 'mimeType' | 'fileName'>,
) {
  const name = document.fileName.toLowerCase();
  if (document.mimeType === 'application/pdf' || name.endsWith('.pdf'))
    return 'PDF';
  if (document.mimeType.startsWith('image/')) return 'IMG';
  if (/\.(xlsx?|csv)$/.test(name)) return 'XLS';
  if (/\.(docx?|odt|rtf)$/.test(name)) return 'DOC';
  return 'FILE';
}

const folderOf = (document: DocumentRecord) =>
  document.projectName || NO_PROJECT;

export default function DocumentsPanel({
  documents,
  employees,
  onSaved,
  onRemoved,
}: {
  documents: DocumentRecord[];
  employees: Employee[];
  onSaved: (documents: DocumentRecord[]) => void;
  onRemoved: (id: string) => void;
}) {
  const api = useFinanceApi();
  const [filters, setFilters] = useSessionState('documents', NO_FILTERS);
  const [dialog, setDialog] = useState<{
    document?: DocumentRecord;
    defaults: DocumentDefaults;
  }>();
  const [toDelete, setToDelete] = useState<DocumentRecord>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );

  const folders = useMemo(() => {
    const names = distinctValues(documents.map((item) => item.projectName));
    const counts = countBy(documents, folderOf);
    return [
      ...names.map((name) => ({
        id: name,
        label: name,
        count: counts[name] ?? 0,
      })),
      ...(counts[NO_PROJECT]
        ? [
            {
              id: NO_PROJECT,
              label: 'No project',
              count: counts[NO_PROJECT] ?? 0,
            },
          ]
        : []),
    ];
  }, [documents]);
  const inFolder = documents.filter(
    (item) => filters.folder === ALL || folderOf(item) === filters.folder,
  );
  const options = {
    categories: distinctValues(inFolder.map((item) => item.category)),
    camps: distinctValues(inFolder.map((item) => item.campName)),
  };
  const needle = filters.search.trim().toLowerCase();
  const shown = inFolder
    .filter(
      (item) =>
        inDateRange(item.documentDate, filters.from, filters.to) &&
        matchesAny(filters.categories, item.category) &&
        matchesAny(filters.camps, item.campName) &&
        (!needle ||
          [
            item.title,
            item.fileName,
            item.note,
            item.category,
            employeeNames.get(item.employeeId) ?? '',
          ].some((value) => value.toLowerCase().includes(needle))),
    )
    .sort(
      (a, b) =>
        b.documentDate.localeCompare(a.documentDate) ||
        b.uploadedAt - a.uploadedAt,
    );
  const byDay = shown.reduce<{ date: string; items: DocumentRecord[] }[]>(
    (days, item) => {
      const last = days[days.length - 1];
      if (last?.date === item.documentDate) last.items.push(item);
      else days.push({ date: item.documentDate, items: [item] });
      return days;
    },
    [],
  );
  const folderLabel =
    folders.find((folder) => folder.id === filters.folder)?.label ??
    'All documents';
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...dateChip(filters, (range) => set(range)),
    ...multiChips(
      'Category',
      filters.categories,
      selfLabels(options.categories),
      (v) => set({ categories: v }),
    ),
    ...multiChips('Camp', filters.camps, selfLabels(options.camps), (v) =>
      set({ camps: v }),
    ),
  ];

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error, fallback) });
    } finally {
      setBusy(false);
    }
  }

  const uploadDefaults = (): DocumentDefaults => ({
    projectName:
      filters.folder === ALL || filters.folder === NO_PROJECT
        ? ''
        : filters.folder,
  });

  return (
    <section className="panel documents-panel people-section">
      <div className="documents-layout">
        <nav aria-label="Project folders" className="folder-list">
          <h3>Folders</h3>
          <button
            aria-current={filters.folder === ALL ? 'true' : undefined}
            className={`folder${filters.folder === ALL ? ' active' : ''}`}
            onClick={() => set({ folder: ALL, categories: [], camps: [] })}
            type="button"
          >
            <span aria-hidden="true">🗂</span>
            All documents
            <small>{documents.length}</small>
          </button>
          {folders.map((folder) => (
            <button
              aria-current={filters.folder === folder.id ? 'true' : undefined}
              className={`folder${filters.folder === folder.id ? ' active' : ''}`}
              key={folder.id}
              onClick={() =>
                set({ folder: folder.id, categories: [], camps: [] })
              }
              type="button"
            >
              <span aria-hidden="true">📁</span>
              {folder.label}
              <small>{folder.count}</small>
            </button>
          ))}
          {folders.length === 0 && (
            <p className="folder-empty">
              A folder appears for each project as documents are uploaded.
            </p>
          )}
        </nav>

        <div className="documents-main">
          <div className="people-toolbar-main">
            <div>
              <h2>{folderLabel}</h2>
              <p>
                Signature sheets, timesheets, contracts and other files, filed
                by day.
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => setDialog({ defaults: uploadDefaults() })}
              type="button"
            >
              ⇪ Upload documents
            </button>
          </div>

          <FilterBar
            searchId="document-search"
            searchLabel="Search documents"
            searchPlaceholder="Search title, file name, note or employee"
            search={filters.search}
            onSearchChange={(search) => set({ search })}
            chips={chips}
            shown={shown.length}
            total={inFolder.length}
            noun="documents"
            onClearAll={() =>
              setFilters((current) => ({
                ...NO_FILTERS,
                folder: current.folder,
              }))
            }
          >
            <DateRangeFilter
              id="document-dates"
              label="Date"
              fromLabel="Documents from date"
              toLabel="Documents to date"
              value={filters}
              onChange={(range) => set(range)}
            />
            <MultiSelectFilter
              id="document-category"
              label="Category"
              allLabel="All categories"
              options={options.categories}
              labels={selfLabels(options.categories)}
              counts={countBy(inFolder, (item) => item.category)}
              selected={filters.categories}
              onChange={(v) => set({ categories: v })}
            />
            <MultiSelectFilter
              id="document-camp"
              label="Camp"
              allLabel="All camps"
              options={options.camps}
              labels={selfLabels(options.camps)}
              counts={countBy(inFolder, (item) => item.campName)}
              selected={filters.camps}
              onChange={(v) => set({ camps: v })}
            />
          </FilterBar>

          {message && (
            <div
              className={`app-message ${message.kind} panel-message`}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              <span>{message.text}</span>
              <button
                aria-label="Dismiss message"
                className="dialog-close"
                onClick={() => setMessage(undefined)}
                type="button"
              >
                ×
              </button>
            </div>
          )}

          {byDay.map((day) => (
            <section className="document-day" key={day.date}>
              <h3>
                {weekday(day.date)}, {formatReportDate(day.date)}
                <span>{plural(day.items.length, 'file')}</span>
              </h3>
              <ul className="document-list">
                {day.items.map((item) => (
                  <li className="document-row" key={item.id}>
                    <span
                      className={`file-kind kind-${fileKind(item).toLowerCase()}`}
                    >
                      {fileKind(item)}
                    </span>
                    <div className="document-info">
                      <button
                        aria-label={`Open ${item.title || item.fileName}`}
                        className="document-title"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api.documents.open(item.id),
                            'The file could not be opened.',
                          )
                        }
                        type="button"
                      >
                        {item.title || item.fileName}
                      </button>
                      <span>
                        {[
                          item.title ? item.fileName : '',
                          formatFileSize(item.sizeBytes),
                          [item.projectName, item.campName]
                            .filter(Boolean)
                            .join(' / '),
                          employeeNames.get(item.employeeId),
                          item.note,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span className="pill pill-blue">{item.category}</span>
                    <div className="row-actions">
                      <button
                        aria-label={`Save a copy of ${item.title || item.fileName}`}
                        className="button button-secondary button-small"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const savedPath = await api.documents.saveAs(
                              item.id,
                            );
                            if (savedPath) {
                              setMessage({
                                kind: 'ok',
                                text: `Saved: ${savedPath}`,
                              });
                            }
                          }, 'The file could not be saved.')
                        }
                        type="button"
                      >
                        Save copy
                      </button>
                      <button
                        aria-label={`Edit ${item.title || item.fileName}`}
                        className="button button-secondary button-small"
                        disabled={busy}
                        onClick={() =>
                          setDialog({ document: item, defaults: {} })
                        }
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`Delete ${item.title || item.fileName}`}
                        className="button button-secondary button-small danger-text"
                        disabled={busy}
                        onClick={() => setToDelete(item)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {shown.length === 0 && (
            <div className="empty-state empty-action">
              <p>
                {inFolder.length === 0
                  ? 'No documents here yet.'
                  : 'No documents match these filters.'}
              </p>
              {inFolder.length === 0 && (
                <button
                  className="button button-primary"
                  onClick={() => setDialog({ defaults: uploadDefaults() })}
                  type="button"
                >
                  Upload the first documents
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <DocumentDialog
          document={dialog.document}
          defaults={dialog.defaults}
          employees={employees}
          documents={documents}
          onClose={() => setDialog(undefined)}
          onSaved={(saved, finished) => {
            onSaved(saved);
            if (!finished) return;
            setDialog(undefined);
            setMessage({
              kind: 'ok',
              text: dialog.document
                ? 'Document details saved.'
                : `${plural(saved.length, 'document')} uploaded.`,
            });
          }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          id="delete-document"
          eyebrow="DELETE DOCUMENT"
          title={`Delete ${toDelete.title || toDelete.fileName}?`}
          confirmLabel="Delete document"
          danger
          busy={busy}
          onCancel={() => setToDelete(undefined)}
          onConfirm={() =>
            run(async () => {
              await api.documents.remove(toDelete.id);
              onRemoved(toDelete.id);
              setMessage({ kind: 'ok', text: 'Document deleted.' });
            }, 'The document could not be deleted.').finally(() =>
              setToDelete(undefined),
            )
          }
        >
          The file will be removed from the database for everyone. Backups made
          before now still contain it.
        </ConfirmDialog>
      )}
    </section>
  );
}
