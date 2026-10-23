"use client";

import { ErrorPanel } from "@/components/app/error-panel";

/** What a screen shows when something throws: components/app/error-panel.tsx. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
