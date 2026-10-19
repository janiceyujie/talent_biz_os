import type { ReactNode } from "react";

/** Keep explanatory text, actions, and optional detail in separate layout rows. */
export function ActionNotice({ children, actions, detail, icon, className = "", role }: {
  children: ReactNode;
  actions?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
  role?: "alert" | "status" | "note";
}) {
  return <div className={`notice action-notice ${className}`} role={role}>
    <div className="notice-content">
      {icon && <span className="notice-icon" aria-hidden="true">{icon}</span>}
      <div className="notice-copy">{children}</div>
    </div>
    {actions && <div className="notice-actions">{actions}</div>}
    {detail && <div className="notice-detail">{detail}</div>}
  </div>;
}
