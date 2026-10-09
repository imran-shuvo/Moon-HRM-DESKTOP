import { FormEvent, useState } from 'react';
import {
  DatabaseConnectionSettings,
  DatabaseStatus,
} from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';

function readForm(form: HTMLFormElement): DatabaseConnectionSettings {
  const data = new FormData(form);
  return {
    host: String(data.get('host') ?? '').trim(),
    port: Number(data.get('port')),
    database: String(data.get('database') ?? '').trim(),
    user: String(data.get('user') ?? '').trim(),
    password: String(data.get('password') ?? ''),
    ssl: data.get('ssl') === 'on',
  };
}

export default function DatabaseConnectionForm({
  status,
  onConnected,
  onCancel,
}: {
  status: DatabaseStatus | undefined;
  onConnected: (status: DatabaseStatus) => void;
  onCancel: (() => void) | undefined;
}) {
  const api = useFinanceApi();
  const [busy, setBusy] = useState<'test' | 'connect'>();
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const current = status?.settings;

  async function testConnection(form: HTMLFormElement) {
    setBusy('test');
    setMessage(undefined);
    try {
      const version = await api.database.test(readForm(form));
      setMessage({
        kind: 'ok',
        text: `Connected successfully (PostgreSQL ${version}).`,
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'Connection failed.'),
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('connect');
    setMessage(undefined);
    try {
      onConnected(await api.database.connect(readForm(event.currentTarget)));
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'Connection failed.'),
      });
      setBusy(undefined);
    }
  }

  return (
    <form className="db-connection-form" onSubmit={connect}>
      <div className="form-grid">
        <label className="form-field" htmlFor="db-host">
          Server (host)
          <input
            defaultValue={current?.host ?? 'localhost'}
            id="db-host"
            name="host"
            required
          />
        </label>
        <label className="form-field" htmlFor="db-port">
          Port
          <input
            defaultValue={current?.port ?? 5432}
            id="db-port"
            max={65535}
            min={1}
            name="port"
            required
            type="number"
          />
        </label>
        <label className="form-field" htmlFor="db-name">
          Database name
          <input
            defaultValue={current?.database ?? 'moon_finance'}
            id="db-name"
            name="database"
            required
          />
        </label>
        <label className="form-field" htmlFor="db-user">
          User name
          <input
            autoComplete="username"
            defaultValue={current?.user ?? ''}
            id="db-user"
            name="user"
            required
          />
        </label>
        <label className="form-field field-wide" htmlFor="db-password">
          Password
          <input
            autoComplete="current-password"
            id="db-password"
            name="password"
            placeholder={
              current ? 'Re-enter the password to change settings' : ''
            }
            type="password"
          />
        </label>
        <label className="checkbox-field field-wide" htmlFor="db-ssl">
          <input
            defaultChecked={current?.ssl ?? false}
            id="db-ssl"
            name="ssl"
            type="checkbox"
          />
          Use an encrypted (SSL) connection — required by most cloud databases
        </label>
      </div>
      {message && (
        <p
          className={message.kind === 'ok' ? 'form-success' : 'form-error'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <div className="dialog-actions">
        {onCancel && (
          <button
            className="button button-secondary"
            disabled={busy !== undefined}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <button
          className="button button-secondary"
          disabled={busy !== undefined}
          onClick={(event) => {
            const { form } = event.currentTarget;
            if (form?.reportValidity()) testConnection(form);
          }}
          type="button"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          className="button button-primary"
          disabled={busy !== undefined}
          type="submit"
        >
          {busy === 'connect' ? 'Connecting…' : 'Save & connect'}
        </button>
      </div>
    </form>
  );
}
