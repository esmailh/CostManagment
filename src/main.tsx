import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import vazirmatnWoff2 from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2';
import './styles/theme.css';
import './styles/global.css';
import { App } from './App';
import { seedDefaultCategories } from './db/seed';
import { repairLoanExpenseLinks } from './services/loans';
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
  // Rebuilds the installment → expense links a lost write broke. A broken link is not cosmetic:
  // it makes the loan unsavable until it is repaired, so this runs before the UI mounts. It is
  // idempotent, and it stays a boot step rather than a schema upgrade because importing a backup
  // writes expenses and installments directly and can reintroduce broken links at any time.
  const repair = await repairLoanExpenseLinks();
  if (repair.linksRestored > 0 || repair.linksCleared > 0 || repair.expensesAdopted > 0 || repair.duplicatesRemoved > 0) {
    console.info('[loan-link-repair]', repair);
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
