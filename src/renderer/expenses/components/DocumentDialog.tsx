import { DragEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { DocumentInput } from '../../../shared/types';
import {
  MAX_ATTACHMENTS_PER_SAVE,
  MAX_ATTACHMENT_BYTES,
} from '../../../shared/validation';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import { employeeOptionLabel } from './peopleUi';
import {
  DocumentRecord,
  Employee,
  distinctValues,
  formatFileSize,
  plural,
  todayKey,
} from '../model';

export const DOCUMENT_CATEGORIES = [
  'Signature sheet',
  'Timesheet',
  'Contract',
  'Iqama / ID',
  'Medical',
  'Invoice',
  'Other',
];

export type DocumentDefaults = Partial<
  Pick<DocumentInput, 'documentDate' | 'category' | 'projectName'>
>;

async function toUpload(file: File) {
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    data: new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * Uploads several files with the same details, or edits one document's
 * details. Files go up 10 at a time; if a batch fails, the files not yet
 * saved stay listed so they can be tried again.
 */
export default function DocumentDialog({
  document,
  defaults,
  employees,
  documents,
  onClose,
  onSaved,
}: {
  /** The document being edited; undefined to upload new files. */
  document: DocumentRecord | undefined;
  defaults: DocumentDefaults;
  employees: Employee[];
  /** Existing documents, for category, project and camp suggestions. */
  documents: DocumentRecord[];
  onClose: () => void;
  /**
   * Called with the documents saved. `finished` is false when only some
   * files were uploaded: the dialog stays open with the rest.
   */
  onSaved: (documents: DocumentRecord[], finished: boolean) => void;
}) {
  const api = useFinanceApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const suggestions = useMemo(
    () => ({
      categories: distinctValues([
        ...DOCUMENT_CATEGORIES,
        ...documents.map((item) => item.category),
      ]),
      projects: distinctValues([
        ...employees.map((employee) => employee.projectName),
        ...documents.map((item) => item.projectName),
      ]),
      camps: distinctValues([
        ...employees.map((employee) => employee.campName),
        ...documents.map((item) => item.campName),
      ]),
    }),
    [documents, employees],
  );

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    const tooBig = added.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    setError(
      tooBig.length
        ? `${tooBig.map((file) => file.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB and ${tooBig.length === 1 ? 'was' : 'were'} not added.`
        : '',
    );
    setFiles((current) => [
      ...current,
      ...added.filter((file) => file.size <= MAX_ATTACHMENT_BYTES),
    ]);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: keyof DocumentInput) =>
      String(form.get(key) ?? '').trim();
    const input: DocumentInput = {
      title: value('title'),
      category: value('category'),
      projectName: value('projectName'),
      campName: value('campName'),
      documentDate: value('documentDate'),
      employeeId: value('employeeId'),
      note: value('note'),
    };
    if (!input.category) {
      setError('Choose or type a category.');
      return;
    }
    if (!document && files.length === 0) {
      setError('Choose at least one file to upload.');
      return;
    }
    setSaving(true);
    setError('');
    if (document) {
      try {
        onSaved([await api.documents.update(document.id, input)], true);
      } catch (saveError) {
        setError(errorMessage(saveError, 'The document could not be saved.'));
        setSaving(false);
      }
      return;
    }
    const saved: DocumentRecord[] = [];
    let remaining = files;
    try {
      while (remaining.length) {
        const batch = remaining.slice(0, MAX_ATTACHMENTS_PER_SAVE);
        setProgress(
          `Uploading ${saved.length + batch.length} of ${files.length}…`,
        );
        // eslint-disable-next-line no-await-in-loop
        const uploads = await Promise.all(batch.map(toUpload));
        // eslint-disable-next-line no-await-in-loop
        saved.push(...(await api.documents.upload(input, uploads)));
        remaining = remaining.slice(batch.length);
      }
      onSaved(saved, true);
    } catch (uploadError) {
      if (saved.length) onSaved(saved, false);
      setFiles(remaining);
      setError(
        `${saved.length ? `${plural(saved.length, 'file')} uploaded. ` : ''}${errorMessage(
          uploadError,
          'The upload failed.',
        )} The files still listed were not saved; try again.`,
      );
      setSaving(false);
      setProgress('');
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="document-dialog-title"
        aria-modal="true"
        className="expense-dialog document-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{document ? 'EDIT DOCUMENT' : 'UPLOAD'}</p>
            <h2 id="document-dialog-title">
              {document
                ? document.title || document.fileName
                : 'Upload documents'}
            </h2>
            <p>
              {document
                ? 'Change where this document is filed.'
                : 'Every file gets the same date, category and project.'}
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="dialog-close"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {!document && (
            <>
              <input
                aria-label="Choose files"
                className="visually-hidden"
                multiple
                onChange={(event) => {
                  addFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
                ref={fileInput}
                type="file"
              />
              <button
                className={`drop-zone${dragging ? ' dragging' : ''}`}
                disabled={saving}
                onClick={() => fileInput.current?.click()}
                onDragLeave={() => setDragging(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDrop={onDrop}
                type="button"
              >
                <span aria-hidden="true">⇪</span>
                <strong>Drop files here or click to choose</strong>
                <small>
                  PDF, photos, scans or any file · up to{' '}
                  {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB each
                </small>
              </button>
              {files.length > 0 && (
                <ul aria-label="Files to upload" className="upload-list">
                  {files.map((file, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={`${file.name}-${index}`}>
                      <span>{file.name}</span>
                      <small>{formatFileSize(file.size)}</small>
                      <button
                        aria-label={`Remove ${file.name}`}
                        className="text-button danger-text"
                        disabled={saving}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, item) => item !== index),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <fieldset className="form-grid document-fields" disabled={saving}>
            <label className="form-field" htmlFor="document-date">
              Date
              <input
                defaultValue={
                  document?.documentDate ?? defaults.documentDate ?? todayKey()
                }
                id="document-date"
                name="documentDate"
                required
                type="date"
              />
            </label>
            <label className="form-field" htmlFor="document-category">
              Category
              <input
                defaultValue={
                  document?.category ?? defaults.category ?? 'Signature sheet'
                }
                id="document-category"
                list="document-category-options"
                maxLength={60}
                name="category"
                required
              />
              <datalist id="document-category-options">
                {suggestions.categories.map((value) => (
                  <option aria-label={value} key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="form-field" htmlFor="document-project">
              Project
              <input
                defaultValue={
                  document?.projectName ?? defaults.projectName ?? ''
                }
                id="document-project"
                list="document-project-options"
                maxLength={120}
                name="projectName"
                placeholder="No project"
              />
              <datalist id="document-project-options">
                {suggestions.projects.map((value) => (
                  <option aria-label={value} key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="form-field" htmlFor="document-camp">
              Camp
              <input
                defaultValue={document?.campName ?? ''}
                id="document-camp"
                list="document-camp-options"
                maxLength={120}
                name="campName"
                placeholder="No camp"
              />
              <datalist id="document-camp-options">
                {suggestions.camps.map((value) => (
                  <option aria-label={value} key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="form-field" htmlFor="document-employee">
              Employee (optional)
              <select
                defaultValue={document?.employeeId ?? ''}
                id="document-employee"
                name="employeeId"
              >
                <option value="">Not about one employee</option>
                {[...employees]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeOptionLabel(employee)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field" htmlFor="document-title">
              Title (optional)
              <input
                defaultValue={document?.title ?? ''}
                id="document-title"
                maxLength={200}
                name="title"
                placeholder="Uses the file name"
              />
            </label>
            <label className="form-field field-wide" htmlFor="document-note">
              Note (optional)
              <input
                defaultValue={document?.note ?? ''}
                id="document-note"
                maxLength={500}
                name="note"
              />
            </label>
          </fieldset>
          {progress && (
            <p className="form-success" role="status">
              {progress}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={saving}
              type="submit"
            >
              {document && 'Save changes'}
              {!document &&
                (files.length
                  ? `Upload ${plural(files.length, 'file')}`
                  : 'Upload')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
