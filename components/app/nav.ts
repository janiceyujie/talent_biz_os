import {
  Archive,
  BarChart3,
  Bot,
  CalendarDays,
  FilePenLine,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; group: "work" | "manage" };

export const nav: NavItem[] = [
  { href: "/", label: "今日總覽", icon: LayoutDashboard, group: "work" },
  { href: "/inbox", label: "進件分類", icon: Inbox, group: "work" },
  { href: "/projects", label: "合作案", icon: FolderKanban, group: "work" },
  { href: "/drafts", label: "擬稿工作台", icon: FilePenLine, group: "work" },
  { href: "/finance", label: "內帳分析", icon: BarChart3, group: "work" },
  { href: "/assistant", label: "個人助理", icon: Bot, group: "work" },
  { href: "/contacts", label: "藝人與合作方", icon: Users, group: "manage" },
  { href: "/files", label: "素材歸檔", icon: Archive, group: "manage" },
  { href: "/calendar", label: "行程", icon: CalendarDays, group: "manage" },
  { href: "/settings", label: "設定", icon: Settings, group: "manage" },
];

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
