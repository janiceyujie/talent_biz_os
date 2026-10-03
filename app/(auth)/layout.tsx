import { LocaleSwitch } from "@/components/locale-switch";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-page">
      <div className="surface auth-card">
        <div className="auth-brand">
          <span>TB</span>
          <strong>Talent Business OS</strong>
        </div>
        {children}
        <LocaleSwitch className="auth-locale" />
      </div>
    </main>
  );
}
