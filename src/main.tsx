import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import vazirmatnWoff2 from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2';
import './styles/theme.css';
import './styles/global.css';
import { App } from './App';
import { seedDefaultCategories } from './db/seed';
import { migrateVerifiedRecurringLoans } from './services/loanMigration';

// Bundle the Persian variable font (single woff2, all weights) and inject it.
const style = document.createElement('style');
style.textContent = `@font-face{font-family:Vazirmatn;src:url('${vazirmatnWoff2}') format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}`;
document.head.appendChild(style);

async function bootstrap() {
  // Run database preparation before mounting so the first reactive read is consistent.
  await seedDefaultCategories();
  const migration = await migrateVerifiedRecurringLoans();
  if (migration.migratedSourceIds.length > 0) {
    console.info('[loan-migration]', migration);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap().catch((error) => {
  console.error('Application bootstrap failed', error);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
