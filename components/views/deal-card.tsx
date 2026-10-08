import type { ReactNode } from "react";

/** One section of a project's screen: a titled white card, with an optional action at the right of its title. */
export function DealCard({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="deal-card">
      <header className="deal-card-header">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
