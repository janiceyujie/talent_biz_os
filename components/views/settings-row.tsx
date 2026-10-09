"use client";

import type { ReactNode } from "react";
import { InfoHint } from "@/components/app/info-hint";

// The settings page's building blocks: groups of rows, each row a label (with
// an optional one-line description, or longer help behind ⓘ) on the left and
// its control on the right. Rows stack on narrow screens.

export function SettingsGroup({ title, hint, children }: { title: string; hint?: string[]; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2>
        {title}
        {hint && <InfoHint label={title} notes={hint} />}
      </h2>
      <div className="surface settings-list">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  htmlFor,
  description,
  hint,
  icon,
  error,
  children,
}: {
  label: string;
  htmlFor?: string; // the control's id, when it's a single field
  description?: ReactNode;
  hint?: string[];
  icon?: ReactNode;
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      {icon && (
        <span className="settings-row-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="settings-row-label">
        <span className="settings-row-title">
          {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
          {hint && <InfoHint label={label} notes={hint} />}
        </span>
        {description && <small>{description}</small>}
        {error && (
          <small className="settings-row-error" role="alert">
            {error}
          </small>
        )}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  );
}
