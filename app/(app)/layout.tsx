import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { requireTalent } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { person, talent } = await requireTalent();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Talent Biz OS
          </Link>
          <span className="text-sm text-zinc-500">{talent.name}</span>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{person.displayName}</span>
            <SignOutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
