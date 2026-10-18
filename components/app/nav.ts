import {
  Archive,
  BarChart3,
  Bot,
  CalendarDays,
  FilePenLine,
  FolderKanban,
  Handshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  Users,
  Network,
  type LucideIcon,
} from "lucide-react";

/** Keys under the "nav" message namespace; also each page's title (settings has no nav item: it's under the avatar menu). */
export type NavKey = "today" | "inbox" | "projects" | "drafts" | "finance" | "assistant" | "contacts" | "files" | "calendar" | "partners" | "settings" | "grants" | "manager";

export type NavItem = { href: string; key: NavKey; icon: LucideIcon; group: "work" | "manage" };

export const nav: NavItem[] = [
  { href: "/", key: "today", icon: LayoutDashboard, group: "work" },
  { href: "/calendar", key: "calendar", icon: CalendarDays, group: "work" },
  { href: "/inbox", key: "inbox", icon: Inbox, group: "work" },
  { href: "/projects", key: "projects", icon: FolderKanban, group: "work" },
  { href: "/drafts", key: "drafts", icon: FilePenLine, group: "work" },
  { href: "/grants", key: "grants", icon: Landmark, group: "work" },
  { href: "/finance", key: "finance", icon: BarChart3, group: "work" },
  { href: "/assistant", key: "assistant", icon: Bot, group: "work" },
  { href: "/manager", key: "manager", icon: Network, group: "manage" },
  { href: "/contacts", key: "contacts", icon: Users, group: "manage" },
  { href: "/files", key: "files", icon: Archive, group: "manage" },
  { href: "/partners", key: "partners", icon: Handshake, group: "manage" },
];

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
