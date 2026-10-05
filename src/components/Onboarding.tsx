import { Button } from './ui/Button';

interface OnboardingProps {
  onDone: () => void;
}

export function Onboarding({ onDone }: OnboardingProps) {
  return (
    <div className="onboarding">
      <div className="onboarding__logo">💸</div>
      <h1 className="onboarding__title">مدیریت ساده هزینه‌ها</h1>
      <p className="onboarding__text">
        هزینه‌های ثابت ماهانه را ثبت کنید، هزینه‌های روزانه را وارد کنید، و در پایان بدانید
        پول‌تان کجا رفته است.
      </p>
      <Button onClick={onDone} style={{ minWidth: 200 }}>
        شروع کنید
      </Button>
    </div>
  );
}
