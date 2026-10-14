import { notFound } from "next/navigation";
import { managerLocalEnabled } from "@/lib/manager/config";
import "@/app/manager.css";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  if (!managerLocalEnabled()) notFound();
  return <div className="manager-workspace">{children}</div>;
}
