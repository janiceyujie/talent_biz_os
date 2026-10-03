import { LocaleSwitch } from "@/components/locale-switch";
import { PRODUCT_MONOGRAM, PRODUCT_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-page">
      <div className="surface auth-card">
        <div className="auth-brand">
          <span>{PRODUCT_MONOGRAM}</span>
          <strong>{PRODUCT_NAME}</strong>
        </div>
        {children}
        <LocaleSwitch className="auth-locale" />
      </div>
    </main>
  );
}
