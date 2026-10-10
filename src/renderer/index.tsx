import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.scss';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

// The API is exposed by the preload script; without it nothing can be saved.
if (window.financeApi) {
  root.render(<App api={window.financeApi} />);
} else {
  root.render(
    <main className="startup-screen">
      <section className="panel startup-card">
        <h1>The app did not start correctly</h1>
        <p className="form-error" role="alert">
          The connection to the database service is missing. Please restart the
          app or reinstall it.
        </p>
      </section>
    </main>,
  );
}
