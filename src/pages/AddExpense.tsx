import { useApp } from '../context/AppContext';
import { useCategories } from '../hooks/useCategories';
import { addExpense } from '../services/expenses';
import { ExpenseForm } from '../components/ExpenseForm';
import { Sheet } from '../components/ui/Sheet';

export function AddExpense() {
  const { tab, addOpen, setAddOpen } = useApp();
  const categories = useCategories();

  return (
    <Sheet open={addOpen && tab !== 'loans'} onClose={() => setAddOpen(false)}>
      <h2 className="modal__title">ثبت هزینه</h2>
      <ExpenseForm
        categories={categories}
        submitLabel="ثبت"
        onSubmit={async (input) => {
          await addExpense(input);
          setAddOpen(false);
        }}
        onCancel={() => setAddOpen(false)}
      />
    </Sheet>
  );
}
